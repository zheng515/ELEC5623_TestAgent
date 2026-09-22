import type { ReactNode } from "react";
import type { VerificationRun } from "../lib/types";
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-orbit" aria-hidden="true">
        ↗
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="notice error" role="alert">
      <span>{message}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          Try again ↻
        </button>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading your workspace…
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

/** One label and tone per run outcome, so every page describes a run the same way. */
export function runBadge(run?: VerificationRun): { label: string; tone: string } {
  if (!run) return { label: "Ready for setup", tone: "neutral" };
  if (run.status === "failed") return { label: "Failed", tone: "amber" };
  if (run.status === "blocked")
    return { label: "Blocked · Integration required", tone: "amber" };
  return { label: "Tests generated · not executed", tone: "teal" };
}
export function modeLabel(mode?: string) {
  return mode === "baseline_b0" ? "B0 baseline mode" : "Scaffold mode";
}
export function percent(value: number | null | undefined) {
  return value == null ? null : `${Math.round(value * 100)}%`;
}
