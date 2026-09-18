import * as sdk from "../api/generated/sdk.gen";
import { client } from "../api/generated/client.gen";
import type {
  ActionCreate,
  ActionUpdate,
  ProjectCreate,
  ProjectUpdate,
} from "../api/generated/types.gen";
client.setConfig({ baseUrl: window.location.origin });
export const api = {
  projects: async () =>
    (await sdk.listProjectsApiProjectsGet({ throwOnError: true })).data,
  project: async (id: string) =>
    (
      await sdk.getProjectApiProjectsProjectIdGet({
        path: { project_id: id },
        throwOnError: true,
      })
    ).data,
  createProject: async (body: ProjectCreate) =>
    (await sdk.createProjectApiProjectsPost({ body, throwOnError: true })).data,
  updateProject: async (id: string, body: ProjectUpdate) =>
    (
      await sdk.updateProjectApiProjectsProjectIdPatch({
        path: { project_id: id },
        body,
        throwOnError: true,
      })
    ).data,
  actions: async () =>
    (await sdk.listActionsApiActionsGet({ throwOnError: true })).data,
  updateAction: async (project: string, id: string, body: ActionUpdate) =>
    (
      await sdk.updateActionApiProjectsProjectIdActionsActionIdPatch({
        path: { project_id: project, action_id: id },
        body,
        throwOnError: true,
      })
    ).data,
  createAction: async (project: string, body: ActionCreate) =>
    (
      await sdk.createActionApiProjectsProjectIdActionsPost({
        path: { project_id: project },
        body,
        throwOnError: true,
      })
    ).data,
  deleteAction: async (project: string, id: string) =>
    sdk.deleteActionApiProjectsProjectIdActionsActionIdDelete({
      path: { project_id: project, action_id: id },
      throwOnError: true,
    }),
  kpi: async () =>
    (await sdk.kpiSummaryApiKpiSummaryGet({ throwOnError: true })).data,
  preview: async (file: File, mode: "create" | "upsert") =>
    (
      await sdk.previewExcelApiExcelPreviewPost({
        body: { file },
        query: { mode },
        throwOnError: true,
      })
    ).data,
  import: async (file: File, mode: "create" | "upsert") =>
    (
      await sdk.importExcelApiExcelImportPost({
        body: { file },
        query: { mode },
        throwOnError: true,
      })
    ).data,
};
export async function download(
  kind: "export" | "template",
  projectId?: string,
) {
  const result =
    kind === "export"
      ? await sdk.exportExcelApiExcelExportGet({
          query: { project_id: projectId },
          parseAs: "blob",
          throwOnError: true,
        })
      : await sdk.excelTemplateApiExcelTemplateGet({
          parseAs: "blob",
          throwOnError: true,
        });
  const data: unknown = result.data;
  if (!(data instanceof Blob))
    throw new Error("The workbook could not be downloaded.");
  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    kind === "template" ? "tooling-template.xlsx" : "tooling-workflow.xlsx";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "detail" in error) {
    const detail = error.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
      return detail
        .map(
          (e: { msg?: string; loc?: unknown[] }) =>
            `${e.loc?.slice(1).join(".") ?? "Input"}: ${e.msg ?? "Invalid value"}`,
        )
        .join("; ");
    if (
      detail &&
      typeof detail === "object" &&
      "errors" in detail &&
      Array.isArray(detail.errors)
    )
      return detail.errors
        .map(
          (e: { sheet: string; row: number; message: string }) =>
            `${e.sheet} row ${e.row}: ${e.message}`,
        )
        .join("; ");
  }
  return "Unable to complete the request. Please try again.";
}
