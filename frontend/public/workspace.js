/* 原样板的服务器存储适配层；不重写渲染、业务动作或 Excel。 */
let serverRevision = 0;
let serverReady = false;
let serverSaving = false;
let serverConflict = false;
let persistedContent = "";
let defaultWorkspace;
let retrySave;
const backupTab =
  sessionStorage.getItem("trw-backup-tab") ||
  [...crypto.getRandomValues(new Uint8Array(16))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
sessionStorage.setItem("trw-backup-tab", backupTab);
const BACKUP_KEY = "trw-unsaved-server-workspace-" + backupTab;
const contentKey = (snap) => JSON.stringify({ ...snap, savedAt: "" });

function saveLabel(message) {
  const label = document.getElementById("saveLbl");
  if (label) label.textContent = message;
}
function savedLabel() {
  saveLabel(
    `Autosaved on server ${new Date(LAST_SAVED).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
  );
}

autosave = async function () {
  // 等当前交互函数结束，避免 render 之后的模板追加被拆成两次写入。
  await Promise.resolve();
  if (!serverReady) return;
  const snap = structuredClone(snapshot());
  const key = contentKey(snap);
  if (key === persistedContent) {
    if (LAST_SAVED) savedLabel();
    return;
  }
  try {
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ revision: serverRevision, snapshot: snap }),
    );
  } catch (_) {}
  if (serverConflict || serverSaving) return;
  serverSaving = true;
  saveLabel("Saving to server…");
  try {
    const response = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: serverRevision, snapshot: snap }),
    });
    if (!response.ok) {
      serverConflict = response.status === 409 || response.status === 422;
      throw new Error(
        response.status === 409
          ? "Another page changed this workspace. Save a workspace file in Admin before reloading."
          : "Not saved on server — use Save workspace file (Admin) to keep your changes.",
      );
    }
    const result = await response.json();
    serverRevision = result.revision;
    persistedContent = key;
    try {
      const backup = JSON.parse(localStorage.getItem(BACKUP_KEY));
      if (backup && contentKey(backup.snapshot) === key)
        localStorage.removeItem(BACKUP_KEY);
    } catch (_) {}
    LAST_SAVED = snap.savedAt;
    STORAGE_OK = true;
    savedLabel();
  } catch (error) {
    STORAGE_OK = false;
    saveLabel(error.message || "Server unavailable — changes are not saved.");
    if (!serverConflict) retrySave = setTimeout(autosave, 3000);
  } finally {
    serverSaving = false;
  }
  // 上一次网络请求期间的新修改按顺序提交，不丢弃最后一次编辑。
  if (STORAGE_OK && contentKey(snapshot()) !== persistedContent)
    void autosave();
};

resetDemo = function () {
  if (
    !confirm(
      "Replace everything with the demo data? Your projects, people and settings on the server will be lost.",
    )
  )
    return;
  Object.keys(EMAILS).forEach((key) => delete EMAILS[key]);
  restore(structuredClone(defaultWorkspace));
  MANUAL = [];
  current = null;
  view = "portfolio";
  refreshUsers();
  render();
};

// 原样板有不触发 render 的备注、必填角色、模板更新；在事件结束后统一保存。
for (const event of ["change", "click"]) {
  document.addEventListener(event, () => queueMicrotask(() => void autosave()));
}
window.addEventListener("beforeunload", (event) => {
  if (serverReady && contentKey(snapshot()) !== persistedContent) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("online", () => {
  clearTimeout(retrySave);
  void autosave();
});

async function bootWorkspace() {
  try {
    // 默认演示数据与原样板逐字段一致；现有服务器工作区优先。
    seed();
    defaultWorkspace = structuredClone(snapshot());
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok)
      throw new Error(
        "Workspace could not be loaded from the server. Reload to retry.",
      );
    const result = await response.json();
    serverRevision = result.revision;
    if (result.snapshot) {
      restore(result.snapshot);
      persistedContent = contentKey(snapshot());
    }
    serverReady = true;
    refreshUsers();
    render();
    try {
      if (localStorage.getItem(BACKUP_KEY))
        toast("An unsaved local backup is available in Admin.");
    } catch (_) {}
  } catch (error) {
    saveLabel(error.message || "Server unavailable. Reload to retry.");
    // 未成功读取时不显示可编辑的空工作区，也不以演示数据覆盖远端。
    document
      .querySelectorAll(".rail button, .rail select")
      .forEach((element) => (element.disabled = true));
  }
}
void bootWorkspace();
