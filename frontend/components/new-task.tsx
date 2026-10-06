import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ProjectCreate, RunMode } from "../lib/types";
import { urlFor } from "../lib/navigation";
import { Badge, ErrorNotice } from "./ui";

const defaultGoal =
  "Identify verification gaps and improve requirement-based tests.";
const initial: ProjectCreate = {
  name: "",
  description: "",
  repository_ref: "",
  requirements_text: "",
  goal: defaultGoal,
};
export const sample: ProjectCreate = {
  name: "Shipping service",
  description: "Boundary and exception checks for shipping charges.",
  repository_ref: "https://github.com/zheng515/ELEC5623_TestAgent",
  requirements_text:
    "R1: Order amounts are integer cents. Orders of at least 10,000 cents receive free shipping; all other non-negative orders have a shipping fee of 1,000 cents.\nR2: Negative order amounts must raise ValueError.",
  goal: "Check shipping thresholds and invalid inputs, then generate targeted tests for uncovered behaviors.",
};
export function NewTask({
  submit,
  busy,
  mode = "scaffold",
  project,
  editing = false,
  cancelHref = urlFor("home"),
}: {
  submit: (form: ProjectCreate) => Promise<void>;
  busy: boolean;
  mode?: RunMode;
  project?: ProjectCreate;
  editing?: boolean;
  cancelHref?: string;
}) {
  const [form, setForm] = useState(project ?? initial);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState("No file selected");
  const change = (key: keyof ProjectCreate, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));
  async function importText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 200000) {
      setError("Choose a .txt or .md file smaller than 200 KB.");
      setFileName("No file selected");
      event.target.value = "";
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      if (!text.trim() || text.length > 50000)
        throw new Error("Requirements must contain 1–50,000 characters.");
      change("requirements_text", text);
      setFileName(file.name);
    } catch (e) {
      setFileName("No file selected");
      setError(e instanceof Error ? e.message : "Unable to read that file.");
    } finally {
      setReading(false);
      event.target.value = "";
    }
  }
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Enter a project name.");
      return;
    }
    if (!form.repository_ref.trim()) {
      setError("Enter a GitHub repository URL.");
      return;
    }
    if (
      !/^https:\/\/github\.com\/[^/\s]+\/[^/\s#?]+(?:\/tree\/[^\s]+)?\/?$/i.test(
        form.repository_ref,
      )
    ) {
      setError(
        "Enter a valid GitHub URL, such as https://github.com/owner/repository.",
      );
      return;
    }
    if (!form.requirements_text.trim()) {
      setError("Enter the Software Requirements Specification (SRS).");
      return;
    }
    if (!form.goal.trim()) {
      setError("Enter a verification goal.");
      return;
    }
    try {
      await submit(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create the task.");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ONE GOAL. ONE STARTING POINT.</span>
          <h1>{editing ? "Edit inputs and rerun" : "New verification task"}</h1>
          <p>
            Define the intended behavior. Let the verification workflow take it
            from there.
          </p>
        </div>
        <a className="text-button" href={cancelHref}>
          ← {editing ? "Cancel editing" : "Back to projects"}
        </a>
      </div>
      <div className="form-layout">
        <form className="panel task-form" onSubmit={onSubmit} noValidate>
          {error && <ErrorNotice message={error} />}
          <fieldset disabled={busy || reading}>
            <div className="form-section">
              <span className="section-number">01</span>
              <div>
                <h2>Project context</h2>
                <p>A name and a reference for your Python project.</p>
              </div>
            </div>
            <label>
              Project name <span className="required">*</span>
              <input
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
                placeholder="e.g. Shipping service"
              />
            </label>
            <label>
              Description <span className="optional">Optional</span>
              <input
                maxLength={2000}
                value={form.description}
                onChange={(e) => change("description", e.target.value)}
                placeholder="What does this project do?"
              />
            </label>
            <label>
              GitHub repository URL <span className="required">*</span>
              <input
                required
                maxLength={500}
                type="url"
                value={form.repository_ref}
                onChange={(e) => change("repository_ref", e.target.value)}
                placeholder="https://github.com/owner/repository"
              />
            </label>
            <p className="field-help">
              Paste a public GitHub repository URL, optionally ending in
              /tree/branch/folder. Each run downloads the code and records the
              exact commit it read. Private repositories require a server-side
              GitHub token; credentials must never be included in this field.
            </p>
            <div className="form-section">
              <span className="section-number">02</span>
              <div>
                <h2>Software Requirements Specification (SRS)</h2>
                <p>
                  Include business rules, boundaries, and exception handling.
                </p>
              </div>
            </div>
            <label>
              SRS content (Requirement text) <span className="required">*</span>
              <textarea
                required
                rows={7}
                maxLength={50000}
                value={form.requirements_text}
                onChange={(e) => change("requirements_text", e.target.value)}
                placeholder="R1: Orders of at least 10,000 cents receive free shipping…"
              />
            </label>
            <div className="input-actions">
              <label className="file-import" htmlFor="requirement-file">
                Import .txt or .md
              </label>
              <input
                className="file-input"
                id="requirement-file"
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={importText}
                aria-describedby="requirement-file-name"
              />
              <span
                className="file-name"
                id="requirement-file-name"
                aria-live="polite"
              >
                {reading ? "Reading file…" : fileName}
              </span>
              <button
                className="text-button"
                type="button"
                onClick={() => setForm(sample)}
              >
                Use shipping example
              </button>
              <span>
                {form.requirements_text.length.toLocaleString("en-US")} / 50,000
              </span>
            </div>
            <div className="form-section">
              <span className="section-number">03</span>
              <div>
                <h2>Verification goal</h2>
                <p>Describe the outcome, rather than individual steps.</p>
              </div>
            </div>
            <label>
              Goal <span className="required">*</span>
              <textarea
                required
                rows={3}
                maxLength={2000}
                value={form.goal}
                onChange={(e) => change("goal", e.target.value)}
              />
            </label>
            <div className="form-bottom">
              <span>
                {mode === "scaffold"
                  ? "No API key required for setup."
                  : "The agent runs in the background. Follow its progress in the workspace."}
              </span>
              <button
                className="button primary"
                disabled={busy || reading}
                type="submit"
              >
                {busy
                  ? editing
                    ? "Saving and starting…"
                    : "Creating task…"
                  : editing
                    ? "Save changes and rerun →"
                    : "Create verification task →"}
              </button>
            </div>
          </fieldset>
        </form>
        <aside className="task-aside">
          <Badge tone="teal">Foundation release</Badge>
          <h2>
            Set the goal.
            <br />
            Keep the evidence.
          </h2>
          <p>
            {mode === "scaffold"
              ? "Save your inputs and create a traceable setup run."
              : "Give the agent a verification goal and review its traceable results."}
          </p>
          <ol>
            <li>Record project and requirements</li>
            <li>Capture the input fingerprint</li>
            {mode !== "scaffold" ? (
              <>
                <li>Analyze requirements and flag ambiguity</li>
                <li>Plan scenarios, inputs, and expected results</li>
                <li>Generate traceable pytest tests</li>
                {mode === "baseline_b2" && (
                  <li>Execute in the sandbox and refine invalid tests once</li>
                )}
              </>
            ) : (
              <>
                <li>Open the agent workspace</li>
                <li>Review integration blockers</li>
              </>
            )}
          </ol>
          <div className="aside-note">
            <strong>What happens today?</strong>
            <p>
              {mode === "baseline_b2"
                ? "The agent analyzes requirements, creates a test plan, generates pytest tests, and executes them when the project can be inspected. Execution errors may trigger one repair attempt. Review the recorded evidence and gaps."
                : mode === "baseline_b0"
                  ? "The agent analyzes requirements, creates a test plan, and generates pytest tests. Execution is not connected; generated tests are not verification evidence."
                  : "The run is marked Blocked until analysis and execution modules are connected. No tests are generated or executed."}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
