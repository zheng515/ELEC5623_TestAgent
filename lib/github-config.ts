export function githubConfigured() {
  return !!(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim());
}
export function githubCallbackURL() {
  return (process.env.BETTER_AUTH_URL || "http://127.0.0.1:3001").replace(/\/$/, "") + "/api/auth/callback/github";
}
export type GitHubConnectionStatus = { configured: boolean; connected: boolean; repositoryScope: boolean; callbackURL: string };
