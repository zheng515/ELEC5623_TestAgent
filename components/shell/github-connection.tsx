"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { GitHubConnectionStatus } from "@/lib/github-config";
import { Button } from "@/components/ui/button";

async function loadStatus(): Promise<GitHubConnectionStatus> {
  const response = await fetch("/api/account/github", { cache: "no-store" });
  if (!response.ok) throw new Error("Cannot load your GitHub connection. Refresh and try again.");
  return response.json();
}
export function GitHubConnection() {
  const [status, setStatus] = useState<GitHubConnectionStatus>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("github");
    loadStatus().then(value => { setStatus(value); if (outcome === "error") setMessage("GitHub authorization was not completed. Retry using a GitHub account with the same email as your ReqTest account."); }).catch(error => setMessage(error.message));
  }, []);
  async function connect() {
    setBusy(true); setMessage("");
    try {
      const result = await authClient.linkSocial({ provider: "github", scopes: ["repo"], callbackURL: "/account", errorCallbackURL: "/account?github=error" });
      if (result.error) throw new Error(result.error.message || "Cannot start GitHub authorization.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Cannot connect GitHub."); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/github", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setStatus(await loadStatus());
      setMessage("Disconnected. Existing snapshots and reports are retained. Revoke the app in GitHub settings to withdraw its authorization there.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Cannot disconnect GitHub."); }
    finally { setBusy(false); }
  }
  return <section className="border rounded-lg p-5 space-y-4">
    <h2 className="text-lg font-semibold">GitHub connection</h2>
    <p className="text-sm text-muted-foreground">Connect once to import repositories you can access. Credentials are encrypted in the database and used only on the server for snapshot downloads.</p>
    <p role="status">{!status ? "Loading connection…" : status.connected ? "Connected" : status.configured ? "Not connected" : "Not configured"}</p>
    {status?.connected && <p className="text-sm text-muted-foreground">{status.repositoryScope ? "Repository scope granted. Organization restrictions may still limit access." : "Private repository scope is missing. Reconnect to request repository access."} Connection status does not confirm that GitHub still accepts the credential.</p>}
    <p className="text-sm text-muted-foreground">GitHub OAuth requests the repo scope, which includes write permissions. ReqTest only reads snapshots. For selected repositories with read-only permissions, use a temporary fine-grained token in the verification form instead.</p>
    <div className="flex flex-wrap gap-3">
      <Button disabled={!status?.configured || busy} onClick={connect}>{busy ? "Please wait…" : status?.connected ? "Reconnect GitHub" : "Connect GitHub"}</Button>
      {status?.connected && <Button variant="outline" disabled={busy} onClick={disconnect}>Disconnect</Button>}
      <a href="https://github.com/settings/applications" target="_blank" rel="noreferrer" className="self-center text-sm underline">Manage GitHub authorizations</a>
    </div>
    {status && <details className="text-sm space-y-3"><summary>Administrator setup</summary>
      <p className="mt-3">Register a GitHub OAuth App, set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.local, then restart the website and worker. Keep the secret out of browser code.</p>
      <p>Homepage URL: use BETTER_AUTH_URL. Authorization callback URL:</p><code className="block break-all">{status.callbackURL}</code>
      <p>Use the same hostname for the app and callback. GitHub linking requires a matching account email. Keep BETTER_AUTH_SECRET and .data persistent so encrypted credentials remain readable.</p>
      <a className="underline" href="https://github.com/settings/developers" target="_blank" rel="noreferrer">Open GitHub developer settings</a>
    </details>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
