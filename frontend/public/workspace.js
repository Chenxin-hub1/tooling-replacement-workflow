/* 原样板的服务器存储适配层；不重写渲染、业务动作或 Excel。 */
let serverRevision = 0;
let serverReady = false;
let serverSaving = false;
let serverConflict = false;
let persistedContent = "";
let defaultWorkspace;
let retrySave;
let recovering = false;
const backupTab =
  sessionStorage.getItem("trw-backup-tab") ||
  [...crypto.getRandomValues(new Uint8Array(16))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
sessionStorage.setItem("trw-backup-tab", backupTab);
const BACKUP_PREFIX = "trw-unsaved-server-workspace-";
const BACKUP_KEY = BACKUP_PREFIX + backupTab;
// 其他标签页异常关闭后会留下孤儿备份（每份约等于整个工作区的大小），
// 一直占着本域 localStorage 配额：启动时淘汰超过 14 天或超出份数的孤儿。
const BACKUP_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
const BACKUP_KEEP_ORPHANS = 3;
const contentKey = (snap) => JSON.stringify({ ...snap, savedAt: "" });

// 备份清单：当前标签页的实时备份排最前，孤儿备份按时间新到旧。
// when 为 0 表示无法判断时间（旧格式备份）：不按过期淘汰，只受份数上限约束。
function listLocalBackups() {
  const items = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(BACKUP_PREFIX)) continue;
      let backup = null;
      try {
        backup = JSON.parse(localStorage.getItem(key));
      } catch (_) {}
      if (!backup || !backup.snapshot) continue;
      items.push({
        key,
        live: key === BACKUP_KEY,
        revision: Number(backup.revision) || 0,
        when:
          backup.writtenAt || Date.parse(backup.snapshot.savedAt || "") || 0,
      });
    }
  } catch (_) {}
  items.sort((a, b) => b.when - a.when || a.key.localeCompare(b.key));
  return [
    ...items.filter((item) => item.live),
    ...items.filter((item) => !item.live),
  ];
}

// 删除过期和超量的孤儿备份；aggressive 用于配额不足时清出空间（全部孤儿）。
function pruneLocalBackups(aggressive = false) {
  const orphans = listLocalBackups().filter((item) => !item.live);
  const doomed = aggressive
    ? orphans
    : [
        ...orphans.filter(
          (item) => item.when > 0 && Date.now() - item.when > BACKUP_EXPIRY_MS,
        ),
        ...orphans.slice(BACKUP_KEEP_ORPHANS),
      ];
  for (const item of new Set(doomed))
    try {
      localStorage.removeItem(item.key);
    } catch (_) {}
}

function writeLocalBackup(snap) {
  const payload = JSON.stringify({
    revision: serverRevision,
    writtenAt: Date.now(),
    snapshot: snap,
  });
  try {
    localStorage.setItem(BACKUP_KEY, payload);
  } catch (_) {
    // 配额不足：先清掉孤儿备份再试一次；仍失败就放弃本次备份，不阻断保存。
    pruneLocalBackups(true);
    try {
      localStorage.setItem(BACKUP_KEY, payload);
    } catch (_) {}
  }
}

// 冲突后的显式恢复：只重取服务器版本号并解锁保存，不用服务器内容覆盖本地修改。
async function resyncServerRevision() {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  if (!response.ok)
    throw new Error("Workspace could not be reached; changes stay unsaved.");
  const result = await response.json();
  serverRevision = result.revision;
  serverConflict = false;
}

// 显式恢复动作（Admin 载入工作区文件、重置演示数据）完成后调用：
// 先取回最新版本号，再立即保存当前内容。期间挂起事件触发的自动保存，
// 避免携带着旧版本号的请求在解锁之后又把冲突重新锁上。
async function recoverAndSave() {
  recovering = true;
  try {
    try {
      await resyncServerRevision();
    } catch (_) {}
  } finally {
    recovering = false;
  }
  await autosave();
}

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
  writeLocalBackup(snap);
  if (recovering || serverConflict || serverSaving) return;
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
  // 重置是显式决定：立刻取回最新版本号解锁冲突并提交，不等下一次交互。
  void recoverAndSave();
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
      persistedContent = contentKey(result.snapshot);
    }
    serverReady = true;
    refreshUsers();
    render();
    try {
      // 孤儿备份（其他标签页遗留）也在这里统一淘汰并提示，避免既看不见也删不掉。
      pruneLocalBackups();
      const backups = listLocalBackups();
      if (backups.length)
        toast(
          backups.length > 1
            ? "Unsaved local backups are available in Admin."
            : "An unsaved local backup is available in Admin.",
        );
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
