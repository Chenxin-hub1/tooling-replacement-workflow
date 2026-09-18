import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCheck,
  CircleAlert,
  Clock3,
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  Search,
} from "lucide-react";
import { api, download, errorMessage } from "../lib/api";
import { filterProjects, phases } from "../lib/domain";
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  ProjectLink,
  Rail,
  useToast,
} from "../components/shared";
import { Button } from "../components/ui/button";
export function Portfolio() {
  const query = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const kpi = useQuery({ queryKey: ["kpi"], queryFn: api.kpi });
  const [search, setSearch] = useState("");
  const [plant, setPlant] = useState("");
  const [bu, setBu] = useState("");
  const [health, setHealth] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const toast = useToast();
  const projects = query.data ?? [];
  const filtered = filterProjects(projects, search, plant, bu, health);
  const total = projects.length;
  const complete = kpi.data?.completed_projects ?? 0;
  const progress = total
    ? Math.round(
        projects.reduce((n, p) => n + (p.summary?.pct ?? 0), 0) / total,
      )
    : 0;
  return (
    <>
      <PageHeader
        eyebrow="YOUR OPERATIONS, CONNECTED"
        title="Tooling portfolio"
        description="A clear view of every project. A confident next step for your team."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                download("export").catch((e) => toast(errorMessage(e), true))
              }
            >
              <ArrowDownToLine size={16} />
              Export
            </Button>
            <Button asChild>
              <Link to="/projects/new">
                <Plus size={17} />
                New project
              </Link>
            </Button>
          </>
        }
      />
      <section className="portfolio-banner">
        <div>
          <div className="banner-eyebrow">
            <span /> LIFECYCLE OVERVIEW
          </div>
          <h2>
            From first request
            <br />
            to the final handover.
          </h2>
          <p>Six connected stages. One shared source of truth.</p>
        </div>
        <div className="banner-metric">
          <span className="banner-number">
            {total}
            <small>projects in your workspace</small>
          </span>
          <div className="banner-progress">
            <div>
              <span>Average completion</span>
              <strong>{progress}%</strong>
            </div>
            <span className="progress-track">
              <span style={{ width: `${progress}%` }} />
            </span>
            <small>
              {complete} completed · {total - complete} in progress
            </small>
          </div>
        </div>
        <div className="banner-pattern" aria-hidden="true">
          <LayersDecoration />
        </div>
      </section>
      <div className="kpi-grid">
        {[
          [
            FolderKanban,
            "Active projects",
            total - complete,
            "Across the full lifecycle",
            "teal",
          ],
          [
            CircleAlert,
            "Overdue actions",
            kpi.data?.overdue_actions ?? 0,
            "Need your attention",
            "red",
          ],
          [
            Clock3,
            "Due in 5 days",
            kpi.data?.due_soon_actions ?? 0,
            "Keep the next steps moving",
            "amber",
          ],
          [
            CheckCheck,
            "Completed projects",
            complete,
            "Successfully delivered",
            "green",
          ],
        ].map(([Icon, label, value, caption, color]) => {
          const I = Icon as typeof FolderKanban;
          return (
            <div className="kpi-card" key={String(label)}>
              <div>
                <span className="kpi-label">{String(label)}</span>
                <strong>{String(value)}</strong>
                <small>{String(caption)}</small>
              </div>
              <span className={`kpi-icon ${color}`}>
                <I size={21} />
              </span>
            </div>
          );
        })}
      </div>
      {kpi.isError && (
        <p role="alert" className="inline-error">
          Summary unavailable.{" "}
          <button onClick={() => kpi.refetch()}>Retry</button>
        </p>
      )}
      <section className="project-section">
        <div className="section-title">
          <h2>
            All projects <span>{filtered.length}</span>
          </h2>
          <div className="view-switch" aria-label="Project view">
            <button
              aria-label="Card view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              aria-label="Table view"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <List size={18} />
            </button>
          </div>
        </div>
        <div className="filters">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search projects"
              placeholder="Search projects, parts or suppliers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter by plant"
            value={plant}
            onChange={(e) => setPlant(e.target.value)}
          >
            <option value="">All plants</option>
            {[...new Set(projects.map((p) => p.plant).filter(Boolean))].map(
              (p) => (
                <option key={p} value={p!}>
                  {p}
                </option>
              ),
            )}
          </select>
          <select
            aria-label="Filter by business unit"
            value={bu}
            onChange={(e) => setBu(e.target.value)}
          >
            <option value="">All business units</option>
            {[...new Set(projects.map((p) => p.bu).filter(Boolean))].map(
              (p) => (
                <option key={p} value={p!}>
                  {p}
                </option>
              ),
            )}
          </select>
          <select
            aria-label="Filter by status"
            value={health}
            onChange={(e) => setHealth(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="red">Overdue</option>
            <option value="yellow">Due soon</option>
            <option value="gray">On track</option>
            <option value="green">Completed</option>
          </select>
          {(search || plant || bu || health) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setPlant("");
                setBu("");
                setHealth("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : !filtered.length ? (
          <Empty
            title={
              total ? "No matching projects" : "Your next project starts here"
            }
            description={
              total
                ? "Try a different search or clear your filters."
                : "Create a tooling project or import your existing workbook to bring your workflow together."
            }
          >
            <Button asChild>
              <Link
                to={total ? "/" : "/projects/new"}
                onClick={() => {
                  setSearch("");
                  setPlant("");
                  setBu("");
                  setHealth("");
                }}
              >
                {total ? "Clear filters" : "Create first project"}
                <ArrowUpRight size={16} />
              </Link>
            </Button>
          </Empty>
        ) : view === "grid" ? (
          <div className="project-grid">
            {filtered.map((p) => (
              <article className="project-card" key={p.id}>
                <div className="card-top">
                  <span className="project-id">{p.id}</span>
                  <Badge health={p.summary?.overall_status} />
                </div>
                <h3>
                  <ProjectLink id={p.id}>{p.desc}</ProjectLink>
                </h3>
                <div className="part-line">
                  {p.pn}
                  <span>·</span>
                  {p.plant || "Plant not assigned"}
                  <span className="bu-label">{p.bu || "No BU"}</span>
                </div>
                <div className="supplier-line">
                  <div>
                    <small>CURRENT SUPPLIER</small>
                    <span>{p.cur || "Not assigned"}</span>
                  </div>
                  <ArrowUpRight size={18} />
                  <div>
                    <small>NEW SUPPLIER</small>
                    <span>{p.nw || "Not assigned"}</span>
                  </div>
                </div>
                <div className="card-progress">
                  <div>
                    <span>{phases[p.summary?.phase ?? 0]}</span>
                    <strong>{p.summary?.pct ?? 0}%</strong>
                  </div>
                  <Rail colors={p.summary?.phase_health} />
                  <div className="card-progress-caption">
                    <span>
                      {p.summary?.completed_actions ?? 0} of{" "}
                      {p.summary?.total_actions ?? 0} actions complete
                    </span>
                    {!!p.summary?.overdue_actions && (
                      <span className="text-red">
                        {p.summary.overdue_actions} overdue
                      </span>
                    )}
                  </div>
                </div>
                <div className="card-footer">
                  <span>
                    <span className="mini-avatar">
                      {(p.owner || p.team?.["BU Buyer"] || "?")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    {p.owner || p.team?.["BU Buyer"] || "Unassigned"}
                  </span>
                  <Link to="/projects/$id" params={{ id: p.id }}>
                    View project <ArrowUpRight size={15} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project / Part</th>
                  <th>Plant</th>
                  <th>Stage</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <ProjectLink id={p.id}>{p.desc}</ProjectLink>
                      <small>
                        {p.id} · {p.pn}
                      </small>
                    </td>
                    <td>{p.plant || "—"}</td>
                    <td>{phases[p.summary?.phase ?? 0]}</td>
                    <td className="table-rail">
                      <Rail colors={p.summary?.phase_health} />
                      <small>{p.summary?.pct ?? 0}% complete</small>
                    </td>
                    <td>
                      <Badge health={p.summary?.overall_status} />
                    </td>
                    <td>{p.owner || p.team?.["BU Buyer"] || "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function LayersDecoration() {
  return (
    <>
      <span />
      <span />
      <span />
    </>
  );
}
