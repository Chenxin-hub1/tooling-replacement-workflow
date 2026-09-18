import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronsUpDown,
  CircleHelp,
  FileSpreadsheet,
  Layers3,
  LayoutDashboard,
  ListTodo,
} from "lucide-react";
import { ToastProvider } from "./components/shared";
import { Portfolio } from "./pages/portfolio";
import { ActionsPage, Management } from "./pages/dashboards";
import { ProjectPage, NewProject } from "./pages/project";
import { DataPage } from "./pages/data";
import "./styles.css";
function Shell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const links = [
    ["/", "Portfolio", LayoutDashboard],
    ["/actions", "My actions", ListTodo],
    ["/management", "Management", ChartNoAxesCombined],
    ["/data", "Data exchange", FileSpreadsheet],
  ] as const;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Layers3 size={25} />
          </span>
          <div>
            TOOLING<span>WORKFLOW WORKSPACE</span>
          </div>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <BriefcaseBusiness size={18} />
          </span>
          <div>
            Operations workspace<small>Tooling replacement</small>
          </div>
          <ChevronsUpDown size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {links.map(([to, label, Icon]) => (
            <Link
              to={to}
              key={to}
              className={
                path === to || (to === "/" && path.startsWith("/projects"))
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              <Icon size={19} />
              {label}
              {path === to && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-card">
          <div className="sidebar-card-icon">
            <Layers3 size={20} />
          </div>
          <h3>
            Every stage.
            <br />
            One clear view.
          </h3>
          <p>
            Keep your team aligned from first tooling request to final archive.
          </p>
          <Link to="/data">
            Explore data exchange <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <CircleHelp size={17} />
          <span>
            Local workspace<small>Workflow v1.0</small>
          </span>
          <span className="online-dot" />
        </div>
      </aside>
      <div className="main-shell">
        <div className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {path === "/actions"
                ? "My actions"
                : path === "/management"
                  ? "Management"
                  : path === "/data"
                    ? "Data exchange"
                    : path === "/projects/new"
                      ? "New project"
                      : path.startsWith("/projects/")
                        ? "Project details"
                        : "Portfolio"}
            </strong>
          </div>
          <div className="topbar-right">
            <span>
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className="avatar">TR</span>
          </div>
        </div>
        <main id="main-content">
          <Outlet />
        </main>
        <footer>
          Tooling Replacement Workflow{" "}
          <span>Built for a complete lifecycle.</span>
        </footer>
      </div>
    </div>
  );
}
const rootRoute = createRootRoute({
  component: Shell,
  notFoundComponent: () => (
    <div className="empty-state">
      <h1>Page not found</h1>
      <Link to="/">Back to portfolio</Link>
    </div>
  ),
});
const routes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: Portfolio,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/actions",
    component: ActionsPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/management",
    component: Management,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/data",
    component: DataPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/new",
    component: NewProject,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$id",
    component: ProjectPage,
  }),
];
const router = createRouter({ routeTree: rootRoute.addChildren(routes) });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15000, retry: 1 } },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
