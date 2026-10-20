import { getAuth } from "./auth";
import { githubConfigured, githubCallbackURL, type GitHubConnectionStatus } from "./github-config";

export async function githubAccount(headers: Headers) {
  const accounts = await (await getAuth()).api.listUserAccounts({ headers });
  return accounts.find(account => account.providerId === "github");
}
export async function githubStatus(headers: Headers): Promise<GitHubConnectionStatus> {
  const account = await githubAccount(headers);
  return { configured: githubConfigured(), connected: !!account, repositoryScope: account?.scopes.includes("repo") || false, callbackURL: githubCallbackURL() };
}
export async function repositoryToken(request: Request, form: FormData) {
  const manual = String(form.get("githubToken") || "").trim();
  if (form.get("useConnectedGitHub") !== "true") return manual;
  if (manual) throw new Error("Choose your connected GitHub account or a temporary token, not both.");
  if (!githubConfigured()) throw new Error("GitHub connection is not configured. Use a temporary repository token instead.");
  const account = await githubAccount(request.headers);
  if (!account) throw new Error("Connect GitHub in Account before using it for this repository.");
  try {
    const result = await (await getAuth()).api.getAccessToken({ headers: request.headers, body: { accountId: account.id } });
    if (!result.accessToken) throw new Error("Missing GitHub token.");
    return result.accessToken;
  } catch { throw new Error("GitHub credentials are unavailable. Reconnect GitHub in Account or use a temporary token."); }
}
