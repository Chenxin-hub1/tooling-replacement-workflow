import {
  cloneElement,
  isValidElement,
  useId,
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Layers3,
  RefreshCw,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { errorMessage } from "../lib/api";
import { healthLabels, phases } from "../lib/domain";
export function Badge({ health }: { health?: string | null }) {
  return (
    <span className={`badge health-${health || "gray"}`}>
      <span />
      {healthLabels[health || "gray"]}
    </span>
  );
}
export function Rail({
  colors,
  labels = false,
}: {
  colors?: string[];
  labels?: boolean;
}) {
  return (
    <div
      className={`rail ${labels ? "rail-labeled" : ""}`}
      aria-label="Six-stage progress"
    >
      {phases.map((name, i) => (
        <div
          key={name}
          title={`${name}: ${healthLabels[colors?.[i] || "gray"]}`}
        >
          <span className={`rail-segment health-${colors?.[i] || "gray"}`} />
          {labels && (
            <small>
              {i + 1}. {name}
            </small>
          )}
        </div>
      ))}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </header>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <RefreshCw className="spin" size={20} />
      Loading workspace…
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="empty-state">
      <AlertCircle />
      <h3>We couldn’t load this view</h3>
      <p>{errorMessage(error)}</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  description,
  children,
}: {
  title?: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Layers3 />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function ProjectLink({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <Link to="/projects/$id" params={{ id }} className="project-link">
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<Record<string, unknown>>(children)
        ? cloneElement(children, {
            id,
            "aria-invalid": !!error,
            "aria-describedby": error ? `${id}-error` : undefined,
          })
        : children}
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}

const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  return (
    <ToastContext.Provider
      value={(message, error = false) => {
        setToast({ message, error });
      }}
    >
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}
