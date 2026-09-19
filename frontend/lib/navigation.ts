import { useSyncExternalStore } from "react";
export type View = "home" | "new" | "workspace" | "evidence" | "reports";
export type Route = { view: View; projectId?: string; runId?: string };
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const requested = params.get("view");
  const view: View =
    requested && ["new", "workspace", "evidence", "reports"].includes(requested)
      ? (requested as View)
      : "home";
  return {
    view,
    projectId: params.get("project") ?? undefined,
    runId: params.get("run") ?? undefined,
  };
}
export function urlFor(view: View, projectId?: string, runId?: string) {
  const params = new URLSearchParams({ view });
  if (projectId) params.set("project", projectId);
  if (runId) params.set("run", runId);
  return `#${params}`;
}
export function navigate(view: View, projectId?: string, runId?: string) {
  window.location.hash = urlFor(view, projectId, runId);
}
