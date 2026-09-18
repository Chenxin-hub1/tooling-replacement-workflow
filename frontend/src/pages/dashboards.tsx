import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CircleAlert, ListChecks } from "lucide-react";
import { api } from "../lib/api";
import { displayDate, phases } from "../lib/domain";
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  ProjectLink,
} from "../components/shared";
export function ActionsPage() {
  const query = useQuery({ queryKey: ["actions"], queryFn: api.actions });
  const [owner, setOwner] = useState(
    () => localStorage.getItem("tooling-owner") || "*",
  );
  const [status, setStatus] = useState("open");
  const actions = query.data ?? [];
  const shown = actions.filter(
    (a) =>
      (owner === "*" || (a.owner || "") === owner) &&
      (status === "all" ||
        (status === "open" ? !a.done_date : a.status === status)),
  );
  return (
    <>
      <PageHeader
        eyebrow="FOCUS ON WHAT’S NEXT"
        title="My actions"
        description="Find your next step. Keep every commitment in sight."
      />
      <div className="focus-banner">
        <ListChecks size={30} />
        <div>
          <h2>{shown.length} actions in focus</h2>
          <p>
            Select your name to see the work assigned to you across every
            project.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="filters">
          <label className="inline-label">
            Assigned to
            <select
              aria-label="Assigned to"
              value={owner}
              onChange={(e) => {
                setOwner(e.target.value);
                localStorage.setItem("tooling-owner", e.target.value);
              }}
            >
              <option value="*">Everyone</option>
              <option value="">Unassigned</option>
              {[...new Set(actions.map((a) => a.owner).filter(Boolean))]
                .sort()
                .map((name) => (
                  <option key={name} value={name!}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
          <label className="inline-label">
            Show
            <select
              aria-label="Action status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="open">Open actions</option>
              <option value="red">Overdue</option>
              <option value="yellow">Due soon</option>
              <option value="green">Completed</option>
              <option value="all">All actions</option>
            </select>
          </label>
          <span className="filter-note">Ordered by due date</span>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : !shown.length ? (
          <Empty
            title="You’re all clear here"
            description="No actions match this assignment and status."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Project</th>
                  <th>Owner / Function</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.tab}</strong>
                      <small>{a.act}</small>
                    </td>
                    <td>
                      <ProjectLink id={a.project_id}>
                        {a.project_description}
                      </ProjectLink>
                      <small>
                        {a.pn} · {phases[a.ph]}
                      </small>
                    </td>
                    <td>
                      {a.owner || "Unassigned"}
                      <small>{a.fn}</small>
                    </td>
                    <td className={a.status === "red" ? "text-red" : ""}>
                      {displayDate(a.due_date)}
                    </td>
                    <td>
                      <Badge health={a.status} />
                    </td>
                    <td>
                      <ProjectLink id={a.project_id}>
                        <span className="sr-only">Open {a.tab}</span>
                      </ProjectLink>
                    </td>
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
export function Management() {
  const query = useQuery({ queryKey: ["kpi"], queryFn: api.kpi });
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const data = query.data;
  return (
    <>
      <PageHeader
        eyebrow="THE BIGGER PICTURE"
        title="Management overview"
        description="Understand your pipeline. Put attention where it has the most impact."
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        data && (
          <>
            <div className="management-hero">
              <div>
                <span className="eyebrow">PORTFOLIO HEALTH</span>
                <h2>
                  {data.overdue_actions ? (
                    <>
                      {data.overdue_actions} actions
                      <br />
                      need attention.
                    </>
                  ) : (
                    <>
                      A clearer path
                      <br />
                      to delivery.
                    </>
                  )}
                </h2>
                <p>
                  {data.total_projects} projects · {data.completed_actions} of{" "}
                  {data.total_actions} actions completed
                </p>
              </div>
              <div className="management-total">
                <CircleAlert size={30} />
                <strong>{data.overdue_by_project.length}</strong>
                <span>projects with overdue work</span>
              </div>
            </div>
            <div className="management-grid">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Lifecycle distribution</h2>
                  <span>Projects by active stage</span>
                </div>
                <div className="chart-list">
                  {phases.map((phase, i) => {
                    const count =
                      data.phase_distribution.find((p) => p.phase === i)
                        ?.projects ?? 0;
                    return (
                      <div className="bar-item" key={phase}>
                        <div>
                          <span>
                            <small>{String(i + 1).padStart(2, "0")}</small>
                            {phase}
                          </span>
                          <strong>{count}</strong>
                        </div>
                        <div className="bar-track">
                          <span
                            style={{
                              width: `${data.total_projects ? (count / data.total_projects) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Where work is waiting</h2>
                  <span>Overdue actions by function</span>
                </div>
                {!data.overdue_by_function.length ? (
                  <Empty
                    title="No overdue actions"
                    description="There are no overdue actions in the portfolio."
                  />
                ) : (
                  <div className="chart-list">
                    {[...data.overdue_by_function]
                      .sort((a, b) => b.overdue_actions - a.overdue_actions)
                      .map((role) => (
                        <div className="bar-item" key={role.function}>
                          <div>
                            <span>{role.function}</span>
                            <strong className="text-red">
                              {role.overdue_actions}
                            </strong>
                          </div>
                          <div className="bar-track bar-red">
                            <span
                              style={{
                                width: `${(role.overdue_actions / Math.max(1, data.overdue_actions)) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </section>
            </div>
            <section className="panel owner-followup">
              <div className="panel-heading">
                <h2>Owner follow-up</h2>
                <span>Overdue actions by responsible person</span>
              </div>
              {!data.overdue_by_owner.length ? (
                <Empty
                  title="No overdue assignments"
                  description="Responsible owners will appear here when work is overdue."
                />
              ) : (
                <div className="owner-chips">
                  {data.overdue_by_owner.map((person) => (
                    <div key={person.owner}>
                      <span className="mini-avatar">
                        {person.owner.slice(0, 2).toUpperCase()}
                      </span>
                      <strong>{person.owner}</strong>
                      <span className="overdue-count">
                        {person.overdue_actions}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Projects to follow up</h2>
                <span>
                  Highest overdue count first <ArrowUpRight size={15} />
                </span>
              </div>
              {!data.overdue_by_project.length ? (
                <Empty
                  title="No project bottlenecks"
                  description="Overdue projects will appear here for follow-up."
                />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Stage</th>
                        <th>Owner</th>
                        <th>Overdue actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.overdue_by_project.map((item) => {
                        const p = projects.data?.find(
                          (p) => p.id === item.project_id,
                        );
                        return (
                          <tr key={item.project_id}>
                            <td>
                              <ProjectLink id={item.project_id}>
                                {p?.desc || item.project_id}
                              </ProjectLink>
                              <small>{item.project_id}</small>
                            </td>
                            <td>{phases[p?.summary?.phase ?? 0]}</td>
                            <td>
                              {p?.owner ||
                                p?.team?.["BU Buyer"] ||
                                "Unassigned"}
                            </td>
                            <td>
                              <span className="overdue-count">
                                {item.overdue_actions}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
