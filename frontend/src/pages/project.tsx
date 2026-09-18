import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import type {
  ActionCreate,
  ActionResponse,
  ActionUpdate,
  ProjectCreate,
  ProjectResponse,
  ProjectUpdate,
} from "../api/generated/types.gen";
import {
  zActionCreate,
  zActionUpdate,
  zProjectCreate,
  zProjectUpdate,
} from "../api/generated/zod.gen";
import { api, download, errorMessage } from "../lib/api";
import {
  actionInput,
  displayDate,
  phases,
  roles,
  safeLink,
  today,
} from "../lib/domain";
import {
  Badge,
  Empty,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  Rail,
  useRefresh,
  useToast,
} from "../components/shared";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/dialog";
const projectFields = [
  ["pn", "Part number"],
  ["desc", "Part description"],
  ["plant", "Plant"],
  ["bu", "Business unit"],
  ["cur", "Current supplier"],
  ["nw", "New supplier"],
  ["reason", "Replacement reason"],
  ["owner", "Project owner"],
  ["po", "Tool PO"],
  ["tag", "Tool asset tag"],
  ["too_owner", "Tool owner"],
  ["cav", "Cavities"],
  ["saving", "Annual saving (€)"],
  ["oem", "OEM / Customer"],
  ["tech", "Technology"],
] as const;
export function NewProject() {
  const navigate = useNavigate();
  const refresh = useRefresh();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [team, setTeam] = useState<Record<string, string>>({});
  const form = useForm<ProjectCreate>({
    resolver: zodResolver(zProjectCreate),
    defaultValues: { pn: "", desc: "" },
  });
  const mutation = useMutation({
    mutationFn: api.createProject,
    onSuccess: async (p) => {
      await refresh();
      toast("Project created with 31 standard actions.");
      navigate({ to: "/projects/$id", params: { id: p.id } });
    },
  });
  async function next() {
    if (step === 0 && !(await form.trigger(["pn", "desc"]))) return;
    setStep(step + 1);
  }
  const submit = form.handleSubmit((values) =>
    mutation.mutate({
      ...values,
      team: Object.fromEntries(
        Object.entries(team)
          .filter(([, v]) => v.trim())
          .map(([k, v]) => [k, v.trim()]),
      ),
    }),
  );
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        Back to portfolio
      </Link>
      <PageHeader
        eyebrow="START WITH A CLEAR PLAN"
        title="Create a project"
        description="Set the foundation. We’ll connect the workflow for you."
      />
      <div className="wizard">
        <div className="wizard-steps">
          {["Project information", "Build your team", "Review & create"].map(
            (label, i) => (
              <div
                className={i === step ? "current" : i < step ? "done" : ""}
                key={label}
              >
                <span>{i < step ? <Check size={17} /> : i + 1}</span>
                <strong>{label}</strong>
              </div>
            ),
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 2) void submit(e);
            else void next();
          }}
        >
          <div className="wizard-content">
            {step === 0 ? (
              <>
                <h2>Tell us about the tooling</h2>
                <p className="muted">
                  Start with the essentials. You can update the details at any
                  time.
                </p>
                <div className="form-grid">
                  {projectFields.slice(0, 8).map(([key, label]) => (
                    <Field
                      key={key}
                      label={
                        label + (key === "pn" || key === "desc" ? " *" : "")
                      }
                      error={form.formState.errors[key]?.message}
                    >
                      <input
                        {...form.register(key, {
                          setValueAs: (v) =>
                            typeof v === "string" ? v.trim() : v,
                        })}
                        placeholder={
                          key === "pn"
                            ? "e.g. 123456789"
                            : key === "desc"
                              ? "e.g. Airbag housing — replacement tool"
                              : ""
                        }
                      />
                    </Field>
                  ))}
                </div>
              </>
            ) : step === 1 ? (
              <>
                <h2>Bring the right people together</h2>
                <p className="muted">
                  Actions are assigned by function. Leave a role empty to assign
                  it later.
                </p>
                <div className="form-grid">
                  {roles.map((role) => (
                    <Field key={role} label={role}>
                      <input
                        value={team[role] || ""}
                        onChange={(e) =>
                          setTeam({ ...team, [role]: e.target.value })
                        }
                        placeholder="Team member name"
                      />
                    </Field>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2>Ready to get things moving?</h2>
                <p className="muted">
                  Your project will start with 31 standard actions across six
                  stages.
                </p>
                <div className="review-summary">
                  <h3>{form.getValues("desc")}</h3>
                  <p>
                    {form.getValues("pn")} ·{" "}
                    {form.getValues("plant") || "Plant not assigned"}
                  </p>
                  <dl>
                    {[
                      ["Business unit", form.getValues("bu")],
                      ["Current supplier", form.getValues("cur")],
                      ["New supplier", form.getValues("nw")],
                      ...roles.map((role) => [role, team[role]]),
                    ].map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value || "Not assigned"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <Rail
                  colors={["green", "gray", "gray", "gray", "gray", "gray"]}
                  labels
                />
              </>
            )}
            {mutation.isError && (
              <p role="alert" className="inline-error">
                {errorMessage(mutation.error)}
              </p>
            )}
          </div>
          <div className="form-footer">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (step ? setStep(step - 1) : navigate({ to: "/" }))}
            >
              {step ? "Back" : "Cancel"}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {step === 2
                ? mutation.isPending
                  ? "Creating…"
                  : "Create project"
                : "Continue"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
export function ProjectPage() {
  const { id } = useParams({ from: "/projects/$id" });
  const query = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.project(id),
  });
  const [tab, setTab] = useState("workflow");
  const [phase, setPhase] = useState<number | null>(null);
  const [edit, setEdit] = useState(false);
  const [custom, setCustom] = useState(false);
  const [action, setAction] = useState<ActionResponse | null>(null);
  const [deleting, setDeleting] = useState<ActionResponse | null>(null);
  const refresh = useRefresh();
  const toast = useToast();
  const deleteMutation = useMutation({
    mutationFn: (action: ActionResponse) => api.deleteAction(id, action.id),
    onSuccess: async () => {
      await refresh();
      setDeleting(null);
      toast("Custom action deleted.");
    },
  });
  if (query.isPending) return <Loading />;
  if (query.isError)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const p = query.data;
  const active = phase ?? p.summary?.phase ?? 1;
  const actions = (p.actions ?? []).filter((a) => a.ph === active);
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        Back to portfolio
      </Link>
      <PageHeader
        eyebrow={p.id}
        title={p.desc}
        description={`${p.pn} · ${p.plant || "Plant not assigned"} · ${p.bu || "Business unit not assigned"}`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                download("export", p.id).catch((e) =>
                  toast(errorMessage(e), true),
                )
              }
            >
              <ArrowDownToLine size={16} />
              Export
            </Button>
            <Button onClick={() => setEdit(true)}>
              <Pencil size={16} />
              Edit project
            </Button>
          </>
        }
      />
      <div className="project-overview panel">
        <div>
          <Badge health={p.summary?.overall_status} />
          <h2>{p.summary?.pct ?? 0}% complete</h2>
          <p>
            {p.summary?.completed_actions ?? 0} of{" "}
            {p.summary?.total_actions ?? 0} actions delivered
          </p>
        </div>
        <div className="overview-rail">
          <Rail colors={p.summary?.phase_health} labels />
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Project sections">
        {[
          ["workflow", "Workflow"],
          ["information", "Project information"],
          ["team", "Team"],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "workflow" ? (
        <div className="workflow-layout">
          <nav className="phase-nav" aria-label="Workflow stages">
            {phases.map((name, i) => (
              <button
                key={name}
                className={active === i ? "selected" : ""}
                onClick={() => setPhase(i)}
              >
                <span
                  className={`phase-number health-${p.summary?.phase_health[i] || "gray"}`}
                >
                  {p.summary?.phase_statuses[i] === "completed" ? (
                    <Check size={15} />
                  ) : (
                    i + 1
                  )}
                </span>
                <div>
                  {name}
                  <small>
                    {
                      (p.actions ?? []).filter((a) => a.ph === i && a.done_date)
                        .length
                    }{" "}
                    / {(p.actions ?? []).filter((a) => a.ph === i).length}{" "}
                    actions
                  </small>
                </div>
              </button>
            ))}
          </nav>
          <section className="panel workflow-panel">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">STAGE {active + 1} OF 6</div>
                <h2>{phases[active]}</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustom(true)}
              >
                <Plus size={16} />
                Add action
              </Button>
            </div>
            {!actions.length ? (
              <Empty
                title="Project foundation is ready"
                description="This stage is completed when the project is created. Add a custom action if more work is needed."
              />
            ) : (
              <div className="action-list">
                {actions.map((a) => (
                  <article key={a.id} className="action-row">
                    <div
                      className={`action-state health-${a.status || "gray"}`}
                    >
                      {a.done_date ? <CheckCheck size={18} /> : <span />}
                    </div>
                    <div className="action-main">
                      <div className="action-title">
                        <h3>{a.tab}</h3>
                        {a.is_custom && (
                          <span className="custom-tag">Custom</span>
                        )}
                        <Badge health={a.status} />
                      </div>
                      <p>{a.act}</p>
                      <div className="action-meta">
                        <span>
                          {a.fn} · {a.owner || "Unassigned"}
                        </span>
                        <span className={a.status === "red" ? "text-red" : ""}>
                          Due {displayDate(a.due_date)}
                        </span>
                      </div>
                      {a.predecessor && (
                        <small className="dependency">
                          After: {a.predecessor.tab} ·{" "}
                          {a.predecessor.done_date ? "Completed" : "Pending"}
                        </small>
                      )}
                      {a.value && <div className="action-value">{a.value}</div>}
                      {a.comment && (
                        <p className="action-comment">{a.comment}</p>
                      )}
                      {safeLink(a.link) && (
                        <a
                          href={safeLink(a.link)!}
                          target="_blank"
                          rel="noreferrer"
                          className="document-link"
                        >
                          View document <ExternalLink size={13} />
                        </a>
                      )}
                      {a.done_date && (
                        <small>Completed {displayDate(a.done_date)}</small>
                      )}
                    </div>
                    <div className="action-buttons">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${a.tab}`}
                        onClick={() => setAction(a)}
                      >
                        <Pencil size={16} />
                      </Button>
                      {a.is_custom && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${a.tab}`}
                          onClick={() => setDeleting(a)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : tab === "information" ? (
        <section className="panel info-panel">
          <h2>Project information</h2>
          <dl className="details-grid">
            {projectFields.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{p[key] || "—"}</dd>
              </div>
            ))}
            <div>
              <dt>Created</dt>
              <dd>{displayDate(p.created_at)}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <section className="panel info-panel">
          <h2>Cross-functional team</h2>
          <div className="team-grid">
            {roles.map((role) => {
              const member = p.team_members?.find((m) => m.function === role);
              return (
                <div className="team-card" key={role}>
                  <span className="team-avatar">
                    <Users size={22} />
                  </span>
                  <div>
                    <small>{role}</small>
                    <h3>{member?.name || "Not assigned"}</h3>
                    <p>{member?.email || "Assign via Edit project"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {edit && <ProjectEditor project={p} onClose={() => setEdit(false)} />}{" "}
      {action && (
        <ActionEditor
          project={p}
          action={action}
          onClose={() => setAction(null)}
        />
      )}{" "}
      {custom && (
        <CustomActionForm
          project={p}
          phase={active}
          onClose={() => setCustom(false)}
        />
      )}{" "}
      {deleting && (
        <Modal
          title="Delete custom action?"
          description={`“${deleting.tab}” will be removed. Actions with dependent work cannot be deleted.`}
          onClose={() => setDeleting(null)}
        >
          <div className="modal-body">
            {deleteMutation.isError && (
              <p role="alert" className="inline-error">
                {errorMessage(deleteMutation.error)}
              </p>
            )}
          </div>
          <div className="form-footer">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deleting)}
            >
              Delete action
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ProjectEditor({
  project,
  onClose,
}: {
  project: ProjectResponse;
  onClose: () => void;
}) {
  const defaults = Object.fromEntries(
    projectFields.map(([key]) => [key, project[key] ?? ""]),
  );
  const form = useForm<ProjectUpdate>({
    resolver: zodResolver(zProjectUpdate),
    defaultValues: defaults,
  });
  const [team, setTeam] = useState<Record<string, string>>(
    Object.fromEntries(
      (project.team_members ?? []).map((m) => [m.function, m.name]),
    ),
  );
  const refresh = useRefresh();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (values: ProjectUpdate) =>
      api.updateProject(project.id, values),
    onSuccess: async () => {
      await refresh();
      toast("Project updated. Open actions have been reassigned where needed.");
      onClose();
    },
  });
  return (
    <Modal
      wide
      title="Edit project"
      description="Update project information and team assignments. Completed actions retain their original owner."
      onClose={onClose}
    >
      <form
        onSubmit={form.handleSubmit((v) =>
          mutation.mutate({
            ...v,
            team: Object.fromEntries(
              Object.entries(team).filter(([, v]) => v.trim()),
            ),
          }),
        )}
      >
        <div className="modal-body">
          <div className="form-grid">
            {projectFields.map(([key, label]) => (
              <Field
                key={key}
                label={label}
                error={form.formState.errors[key]?.message}
              >
                <input {...form.register(key)} />
              </Field>
            ))}
          </div>
          <h3 className="form-subtitle">Team assignments</h3>
          <p className="muted">Blank roles keep their existing assignment.</p>
          <div className="form-grid">
            {roles.map((role) => (
              <Field key={role} label={role}>
                <input
                  value={team[role] || ""}
                  onChange={(e) => setTeam({ ...team, [role]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          {mutation.isError && (
            <p role="alert" className="inline-error">
              {errorMessage(mutation.error)}
            </p>
          )}
        </div>
        <div className="form-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ActionEditor({
  project,
  action,
  onClose,
}: {
  project: ProjectResponse;
  action: ActionResponse;
  onClose: () => void;
}) {
  const form = useForm<ActionUpdate>({
    resolver: zodResolver(zActionUpdate),
    defaultValues: {
      value: action.value,
      owner: action.owner || null,
      comment: action.comment,
      link: action.link,
      done_date: action.done_date,
      lead: action.lead,
      due_date: action.due_date,
    },
  });
  const [automatic, setAutomatic] = useState(action.lead != null);
  const refresh = useRefresh();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (v: ActionUpdate) => api.updateAction(project.id, action.id, v),
    onSuccess: async () => {
      await refresh();
      toast("Action updated and dependent dates recalculated.");
      onClose();
    },
  });
  const nullEmpty = (v: string) => v || null;
  const input = actionInput(action);
  return (
    <Modal
      title={`Edit ${action.tab}`}
      description={action.act}
      onClose={onClose}
    >
      <form
        onSubmit={form.handleSubmit((v) => {
          const payload = { ...v };
          if (automatic) delete payload.due_date;
          else payload.lead = null;
          mutation.mutate(payload);
        })}
      >
        <div className="modal-body">
          <Field
            label={`Value · ${action.input_type}`}
            error={form.formState.errors.value?.message}
          >
            {input === "select" ? (
              <select {...form.register("value", { setValueAs: nullEmpty })}>
                <option value="">Select a value</option>
                {action.input_type.split(" / ").map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                type={input}
                {...form.register("value", { setValueAs: nullEmpty })}
              />
            )}
          </Field>
          <div className="form-grid">
            <Field label="Owner" error={form.formState.errors.owner?.message}>
              <input {...form.register("owner", { setValueAs: nullEmpty })} />
            </Field>
            <Field
              label="Completion date"
              error={form.formState.errors.done_date?.message}
            >
              <input
                type="date"
                {...form.register("done_date", { setValueAs: nullEmpty })}
              />
            </Field>
          </div>
          <div className="completion-tools">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => form.setValue("done_date", today())}
            >
              <Check size={15} />
              Mark complete today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => form.setValue("done_date", null)}
            >
              Reopen action
            </Button>
          </div>
          <Field label="Scheduling">
            <select
              value={automatic ? "automatic" : "manual"}
              onChange={(e) => {
                setAutomatic(e.target.value === "automatic");
                if (e.target.value === "automatic")
                  form.setValue("lead", action.lead ?? 0);
                else form.setValue("lead", null);
              }}
            >
              <option value="automatic">
                Lead time from predecessor / project start
              </option>
              <option value="manual">Manual target date</option>
            </select>
          </Field>
          {automatic ? (
            <Field
              label="Lead time (days)"
              error={form.formState.errors.lead?.message}
            >
              <input
                type="number"
                min="0"
                max="36500"
                {...form.register("lead", {
                  setValueAs: (v) => (v === "" ? null : Number(v)),
                })}
              />
            </Field>
          ) : (
            <Field
              label="Target date"
              error={form.formState.errors.due_date?.message}
            >
              <input
                type="date"
                {...form.register("due_date", { setValueAs: nullEmpty })}
              />
            </Field>
          )}
          <Field label="Comment">
            <textarea
              rows={3}
              {...form.register("comment", { setValueAs: nullEmpty })}
            />
          </Field>
          <Field label="Document link">
            <input
              type="url"
              placeholder="https://…"
              {...form.register("link", { setValueAs: nullEmpty })}
            />
          </Field>
          {mutation.isError && (
            <p role="alert" className="inline-error">
              {errorMessage(mutation.error)}
            </p>
          )}
        </div>
        <div className="form-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save action"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function CustomActionForm({
  project,
  phase,
  onClose,
}: {
  project: ProjectResponse;
  phase: number;
  onClose: () => void;
}) {
  const form = useForm<ActionCreate>({
    resolver: zodResolver(zActionCreate),
    defaultValues: {
      ph: phase,
      fn: "SDE",
      input_type: "Text",
      tab: "",
      act: "",
    },
  });
  const refresh = useRefresh();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (v: ActionCreate) => api.createAction(project.id, v),
    onSuccess: async () => {
      await refresh();
      toast("Custom action added.");
      onClose();
    },
  });
  return (
    <Modal
      title="Add a custom action"
      description="Add a project-specific step and connect it to the workflow."
      onClose={onClose}
    >
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
        <div className="modal-body">
          <Field
            label="Action name *"
            error={form.formState.errors.tab?.message}
          >
            <input {...form.register("tab")} />
          </Field>
          <Field
            label="Instructions *"
            error={form.formState.errors.act?.message}
          >
            <textarea {...form.register("act")} />
          </Field>
          <div className="form-grid">
            <Field label="Stage">
              <select {...form.register("ph", { valueAsNumber: true })}>
                {phases.map((p, i) => (
                  <option value={i} key={p}>
                    {i + 1}. {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Function">
              <select {...form.register("fn")}>
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </Field>
            <Field label="Input type">
              <select {...form.register("input_type")}>
                <option>Text</option>
                <option>Date</option>
                <option>Document link</option>
              </select>
            </Field>
            <Field
              label="Lead time (days)"
              error={form.formState.errors.lead?.message}
            >
              <input
                type="number"
                min="0"
                {...form.register("lead", {
                  setValueAs: (v) => (v === "" ? null : Number(v)),
                })}
              />
            </Field>
          </div>
          <Field label="Predecessor">
            <select
              {...form.register("dep_id", { setValueAs: (v) => v || null })}
            >
              <option value="">Project start</option>
              {project.actions?.map((a) => (
                <option key={a.id} value={a.id}>
                  {phases[a.ph]} · {a.tab}
                </option>
              ))}
            </select>
          </Field>
          {mutation.isError && (
            <p role="alert" className="inline-error">
              {errorMessage(mutation.error)}
            </p>
          )}
        </div>
        <div className="form-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            Add action
          </Button>
        </div>
      </form>
    </Modal>
  );
}
