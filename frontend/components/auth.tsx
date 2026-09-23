"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, FormEvent } from "react";
import { ApiError, api } from "../lib/api";
import type { User } from "../lib/types";
import { ErrorNotice, Loading } from "./ui";
import { navigate } from "../lib/navigation";

export function AuthGate({
  workspace: Workspace,
}: {
  workspace: ComponentType<{ user: User; signOut: () => Promise<void> }>;
}) {
  const [user, setUser] = useState<User | null>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    async function restore() {
      const current = ++generation.current;
      try {
        const result = await api.me();
        if (active && current === generation.current) {
          setUser(result);
          setError("");
        }
      } catch (failure) {
        if (!active || current !== generation.current) return;
        if (failure instanceof ApiError && failure.status === 401) {
          setUser(null);
          setError("");
        } else {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to check your session.",
          );
        }
      }
    }
    function expire() {
      generation.current++;
      setUser(null);
      setError("");
      setNotice("Your session has ended. Please sign in again.");
    }
    void restore();
    window.addEventListener("reqtest:session-expired", expire);
    window.addEventListener("focus", restore);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("reqtest-auth");
      channel.current.onmessage = () => {
        void restore();
      };
    }
    return () => {
      active = false;
      window.removeEventListener("reqtest:session-expired", expire);
      window.removeEventListener("focus", restore);
      channel.current?.close();
      channel.current = null;
    };
  }, [revision]);

  function authenticated(result: User) {
    generation.current++;
    setUser(result);
    setError("");
    setNotice("");
    channel.current?.postMessage("session-changed");
  }

  async function signOut() {
    await api.logout();
    generation.current++;
    setUser(null);
    setNotice("You have been signed out.");
    navigate("home");
    channel.current?.postMessage("session-changed");
  }

  if (error)
    return (
      <main className="auth-loading">
        <ErrorNotice
          message={error}
          retry={() => {
            setError("");
            setRevision((n) => n + 1);
          }}
        />
      </main>
    );
  if (user === undefined)
    return (
      <main className="auth-loading">
        <Loading />
      </main>
    );
  if (!user)
    return <AuthForm onAuthenticated={authenticated} notice={notice} />;
  return <Workspace key={user.id} user={user} signOut={signOut} />;
}

function AuthForm({
  onAuthenticated,
  notice,
}: {
  onAuthenticated: (user: User) => void;
  notice: string;
}) {
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (registering && !name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    if (registering && (password.length < 8 || password.length > 128)) {
      setError("Use 8–128 characters for your password.");
      return;
    }
    if (registering && password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const credentials = { email: email.trim(), password };
      const result = registering
        ? await api.register({ ...credentials, name: name.trim() })
        : await api.login(credentials);
      onAuthenticated(result);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setRegistering(!registering);
    setError("");
    setPassword("");
    setConfirmation("");
    setVisible(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-label="About ReqTest">
        <div className="brand">
          <span className="brand-mark">
            r<span>t</span>
          </span>
          reqtest<span className="brand-dot">.</span>
        </div>
        <div className="auth-intro">
          <span className="eyebrow">FROM REQUIREMENTS TO EVIDENCE</span>
          <h1>
            Every requirement.
            <br />A traceable outcome.
          </h1>
          <p>
            Bring your requirements, tests, and verification evidence together
            in one workspace.
          </p>
          <div className="auth-steps">
            <span>01 / Understand</span>
            <span>02 / Verify</span>
            <span>03 / Review</span>
          </div>
        </div>
        <span className="auth-caption">ELEC5623 / GROUP 04</span>
      </section>
      <section className="auth-content" aria-labelledby="auth-heading">
        <div className="auth-card">
          <span className="eyebrow">YOUR VERIFICATION WORKSPACE</span>
          <h2 id="auth-heading">
            {registering ? "Create your account" : "Welcome back"}
          </h2>
          <p className="auth-description">
            {registering
              ? "Start keeping your projects and verification evidence in one place."
              : "Sign in to continue to your projects and reports."}
          </p>
          {notice && !registering && (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          )}
          {error && <ErrorNotice message={error} />}
          <form onSubmit={submit} noValidate>
            <fieldset disabled={busy}>
              {registering && (
                <label htmlFor="auth-name">
                  Full name
                  <input
                    id="auth-name"
                    autoComplete="name"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              )}
              <label htmlFor="auth-email">
                Email address
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  spellCheck={false}
                  autoCapitalize="none"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label htmlFor="auth-password">Password</label>
              <div className="auth-password">
                <input
                  id="auth-password"
                  type={visible ? "text" : "password"}
                  required
                  maxLength={128}
                  autoComplete={
                    registering ? "new-password" : "current-password"
                  }
                  aria-describedby={registering ? "password-help" : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="text-button"
                  aria-pressed={visible}
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </div>
              {registering && (
                <>
                  <p id="password-help" className="small muted">
                    Use 8–128 characters. A long, unique passphrase works well.
                  </p>
                  <label htmlFor="auth-confirm">
                    Confirm password
                    <input
                      id="auth-confirm"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      maxLength={128}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                    />
                  </label>
                </>
              )}
              <button
                className="button primary auth-submit"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? registering
                    ? "Creating account…"
                    : "Signing in…"
                  : registering
                    ? "Create account"
                    : "Sign in"}
              </button>
            </fieldset>
          </form>
          <p className="auth-switch">
            {registering ? "Already have an account?" : "New to ReqTest?"}{" "}
            <button
              type="button"
              className="text-button"
              onClick={switchMode}
              disabled={busy}
            >
              {registering ? "Sign in" : "Create account"}
            </button>
          </p>
        </div>
        <p className="auth-footer">REQTEST / REQUIREMENT-AWARE VERIFICATION</p>
      </section>
    </main>
  );
}
