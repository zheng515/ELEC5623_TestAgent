import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type {
  ProjectCreate,
  RunMode,
  RequirementDocument,
  DocumentCapabilities,
} from "../lib/types";
import { documentLocation } from "../lib/source-location";
import { api } from "../lib/api";
import { urlFor } from "../lib/navigation";
import { ErrorNotice } from "./ui";

const initial: ProjectCreate = {
  name: "",
  description: "",
  repository_ref: "",
  requirements_text: "",
};
export const sample: ProjectCreate = {
  name: "Shipping service",
  description: "Boundary and exception checks for shipping charges.",
  repository_ref: "https://github.com/zheng515/ELEC5623_TestAgent",
  requirements_text:
    "R1: Order amounts are integer cents. Orders of at least 10,000 cents receive free shipping; all other non-negative orders have a shipping fee of 1,000 cents.\nR2: Negative order amounts must raise ValueError.",
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
  project?: ProjectCreate & {
    requirement_document?: RequirementDocument | null;
  };
  editing?: boolean;
  cancelHref?: string;
}) {
  const [form, setForm] = useState<ProjectCreate>(() =>
    project
      ? {
          name: project.name,
          description: project.description,
          repository_ref: project.repository_ref,
          requirements_text: project.requirements_text,
          requirement_document_id: project.requirement_document_id ?? null,
        }
      : initial,
  );
  const [capabilities, setCapabilities] = useState<DocumentCapabilities | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    api
      .documentCapabilities()
      .then((value) => {
        if (active) setCapabilities(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState(
    project?.requirement_document?.filename ?? "No file selected",
  );
  const [document, setDocument] = useState<RequirementDocument | null>(
    project?.requirement_document ?? null,
  );
  const sourceCharacters = Array.from(document?.text ?? "");
  const [sourceCleared, setSourceCleared] = useState(false);
  const change = (key: keyof ProjectCreate, value: string) => {
    if (key === "requirements_text" && document) {
      setDocument(null);
      setSourceCleared(true);
      setFileName("No file selected");
      setForm((p) => ({ ...p, [key]: value, requirement_document_id: null }));
    } else setForm((p) => ({ ...p, [key]: value }));
  };
  async function importText(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    if (!/\.(txt|md|pdf|docx|doc)$/i.test(file.name) || file.size > 5000000) {
      setError(
        "Choose a .txt, .md, PDF, .docx, or .doc file no larger than 5 MB.",
      );
      event.target.value = "";
      return;
    }
    setReading(true);
    try {
      let imported: RequirementDocument | null = null;
      let text: string;
      if (/\.(pdf|docx|doc)$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 8192),
          );
        imported = await api.importDocument(
          file.name,
          btoa(binary),
          ((capabilities?.import_timeout_seconds ?? 120) + 15) * 1000,
        );
        text = imported.text;
      } else text = (await file.text()).trim();
      if (!text.trim() || text.length > 50000)
        throw new Error("Requirements must contain 1–50,000 characters.");
      setForm((p) => ({
        ...p,
        requirements_text: text,
        requirement_document_id: imported?.id ?? null,
      }));
      setDocument(imported);
      setSourceCleared(false);
      setFileName(file.name);
    } catch (e) {
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
      !/^https:\/\/github\.com\/[^/\s]+\/[^/\s#?]+(?:\/(?:tree\/[^\s]+|commit\/[0-9a-f]{7,64}))?\/?$/i.test(
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
          <h1>{editing ? "Edit inputs and rerun" : "New verification task"}</h1>
          <p>Enter the project and its requirements.</p>
        </div>
        <a className="text-button" href={cancelHref}>
          ← {editing ? "Cancel editing" : "Back to projects"}
        </a>
      </div>
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
          <div className="field-row">
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
          </div>
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
            /tree/branch/folder or /commit/sha. Each run downloads the code and
            records the exact commit it read. Private repositories require a
            server-side GitHub token; credentials must never be included in this
            field.
          </p>
          <div className="form-section">
            <span className="section-number">02</span>
            <div>
              <h2>Software Requirements Specification (SRS)</h2>
              <p>Include business rules, boundaries, and exception handling.</p>
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
              Import .txt, .md, PDF, or Word (.docx, .doc)
            </label>
            <input
              className="file-input"
              id="requirement-file"
              type="file"
              accept=".txt,.md,.pdf,.docx,.doc,application/msword,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
              onClick={() => {
                setForm(sample);
                setDocument(null);
                setSourceCleared(false);
                setFileName("No file selected");
              }}
            >
              Use shipping example
            </button>
            <span>
              {form.requirements_text.length.toLocaleString("en-US")} / 50,000
            </span>
          </div>
          <p className="field-help">
            PDF supports native text and automatic OCR. Word .docx and legacy
            .doc files are supported. OCR may misread numbers or wording; check
            the source preview.
          </p>
          {capabilities && (
            <p className="field-help">
              {capabilities.ocr_ready
                ? `OCR ready (${capabilities.ocr_languages}).`
                : "OCR unavailable on this server; text-based PDFs can still be imported."}{" "}
              {capabilities.doc_ready
                ? "Legacy Word conversion ready."
                : "Legacy Word conversion unavailable on this server."}
            </p>
          )}
          {sourceCleared && (
            <p role="status">
              Text was edited. Original file locations were cleared; reimport to
              restore them.
            </p>
          )}
          {document && (
            <div className="aside-note">
              <strong>Imported source: {document.filename}</strong>
              {document.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <details>
                <summary>
                  Extracted text by source location ({document.segments.length})
                </summary>
                {document.segments.map((segment) => (
                  <div key={segment.start}>
                    <p>{documentLocation(segment)}</p>
                    <pre className="requirement-source">
                      {sourceCharacters
                        .slice(segment.start, segment.end)
                        .join("")}
                    </pre>
                  </div>
                ))}
              </details>
            </div>
          )}
          <div className="form-bottom">
            <span>
              {mode === "scaffold"
                ? "Model access is not configured. The run only records your inputs; no tests are generated or executed."
                : mode === "baseline_b0"
                  ? "Test execution is not connected. Tests are generated but not run, so they are not verification evidence."
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
    </>
  );
}
