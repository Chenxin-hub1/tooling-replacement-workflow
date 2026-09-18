import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  ShieldCheck,
} from "lucide-react";
import type { ImportReport } from "../api/generated/types.gen";
import { api, download, errorMessage } from "../lib/api";
import { PageHeader, useRefresh, useToast } from "../components/shared";
import { Button } from "../components/ui/button";
export function DataPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"create" | "upsert">("create");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [committed, setCommitted] = useState(false);
  const toast = useToast();
  const refresh = useRefresh();
  const preview = useMutation({
    mutationFn: () => api.preview(file!, mode),
    onSuccess: (report) => {
      setReport(report);
      setCommitted(false);
    },
  });
  const submit = useMutation({
    mutationFn: () => api.import(file!, mode),
    onSuccess: async (report) => {
      setReport(report);
      setCommitted(true);
      await refresh();
      toast("Workbook imported successfully.");
    },
  });
  function reset() {
    setReport(null);
    setCommitted(false);
    preview.reset();
    submit.reset();
  }
  return (
    <>
      <PageHeader
        eyebrow="KEEP YOUR DATA CONNECTED"
        title="Data exchange"
        description="Bring your existing work with you. Take a complete snapshot whenever you need it."
      />
      <div className="data-grid">
        <section className="panel import-panel">
          <div className="panel-heading">
            <div className="heading-icon">
              <FileUp />
              <div>
                <h2>Import a workbook</h2>
                <span>Preview first. Commit when you’re ready.</span>
              </div>
            </div>
          </div>
          <div className="data-body">
            <label className="upload-zone">
              <span>
                <FileSpreadsheet size={32} />
              </span>
              <strong>{file ? file.name : "Choose an Excel workbook"}</strong>
              <p>.xlsx files up to 10 MB</p>
              <input
                aria-label="Excel workbook"
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  reset();
                }}
              />
              <span className="upload-button">Browse files</span>
            </label>
            <label className="field">
              <span>Import mode</span>
              <select
                aria-label="Import mode"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "create" | "upsert");
                  reset();
                }}
              >
                <option value="create">Create new projects only</option>
                <option value="upsert">
                  Create and update existing projects
                </option>
              </select>
            </label>
            <p className="muted">
              {mode === "create"
                ? "Existing project IDs will be reported as conflicts."
                : "Matching IDs will be updated. Projects and actions not in this workbook will be kept."}
            </p>
            <Button
              disabled={!file || preview.isPending || submit.isPending}
              onClick={() => {
                setReport(null);
                preview.mutate();
              }}
            >
              {preview.isPending ? "Checking workbook…" : "Preview import"}
              <ArrowRight size={16} />
            </Button>
            {preview.isError && (
              <p role="alert" className="inline-error">
                {errorMessage(preview.error)}
              </p>
            )}
            {report && (
              <div className="import-result">
                <h3>
                  {committed ? (
                    <>
                      <CheckCircle2 size={19} /> Import complete
                    </>
                  ) : report.valid ? (
                    "Workbook is ready to import"
                  ) : (
                    "Review the issues below"
                  )}
                </h3>
                <div className="import-counts">
                  <div>
                    <strong>{report.created_projects}</strong>
                    <span>new projects</span>
                  </div>
                  <div>
                    <strong>{report.updated_projects}</strong>
                    <span>updated projects</span>
                  </div>
                  <div>
                    <strong>{report.action_rows}</strong>
                    <span>action rows</span>
                  </div>
                </div>
                {!!report.warnings?.length && (
                  <ul className="warning-list">
                    {report.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                )}
                {!!report.errors?.length && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Sheet / Row</th>
                          <th>Issue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.errors.map((error, i) => (
                          <tr key={i}>
                            <td>
                              {error.sheet} · {error.row || "Header"}
                            </td>
                            <td>{error.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {report.valid && !committed && (
                  <>
                    <p>No data has been written yet.</p>
                    <Button
                      disabled={submit.isPending}
                      onClick={() => submit.mutate()}
                    >
                      {submit.isPending ? "Importing…" : "Confirm import"}
                    </Button>
                  </>
                )}
                {submit.isError && (
                  <p role="alert" className="inline-error">
                    {errorMessage(submit.error)}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
        <div className="data-aside">
          <section className="panel export-panel">
            <span className="feature-icon">
              <ArrowDownToLine size={25} />
            </span>
            <h2>
              Your complete portfolio,
              <br />
              ready to share.
            </h2>
            <p>
              Download project details, team assignments, every action and a
              summary in one workbook.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                download("export").catch((e) => toast(errorMessage(e), true))
              }
            >
              <ArrowDownToLine size={16} />
              Export all projects
            </Button>
          </section>
          <section className="panel template-panel">
            <FileSpreadsheet size={24} />
            <h3>Start with the right structure</h3>
            <p>
              Use the template with Projects, Teams and Actions sheets. Common
              English and Chinese column names are supported.
            </p>
            <button
              className="text-link"
              onClick={() =>
                download("template").catch((e) => toast(errorMessage(e), true))
              }
            >
              Download blank template <ArrowRight size={15} />
            </button>
          </section>
          <div className="data-note">
            <ShieldCheck size={21} />
            <p>
              Imports are validated as a whole. If any row fails, no changes are
              saved.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
