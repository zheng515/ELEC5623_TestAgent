import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { dataDir } from "./auth";
import { dockerTool } from "./python-tools";

export const segmentSchema = z.object({ id: z.string(), text: z.string(), location: z.string(), page: z.number().int().positive().optional(), paragraph: z.number().int().positive().optional(), line: z.number().int().positive().optional(), extraction: z.enum(["ocr", "text"]).optional(), confidence: z.number().min(0).max(100).optional() });
export const pageSchema = z.object({ page: z.number().int().positive(), status: z.enum(["text", "ocr", "mixed", "partial", "unreadable", "failed", "skipped"]), detail: z.string(), confidence: z.number().min(0).max(100).optional() });
export type DocumentPage = z.infer<typeof pageSchema>;
export const documentSchema = z.object({ id: z.string().uuid(), fileName: z.string(), sha256: z.string(), format: z.enum(["pdf", "doc", "docx", "txt", "md"]), segments: z.array(segmentSchema), warnings: z.array(z.string()), pages: z.array(pageSchema).max(100).default([]) });
export type RequirementDocument = z.infer<typeof documentSchema>;
export type RequirementSource = { documentId: string; segmentId: string; fileName: string; sha256: string; location: string; page?: number; paragraph?: number; line?: number; extraction?: "ocr" | "text"; confidence?: number; quote?: string; start?: number };
export class DocumentIntegrityError extends Error {}
function directory(userId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid requirement document.");
  return join(dataDir, "documents", createHash("sha256").update(userId).digest("hex"), id);
}
export async function extractRequirements(userId: string, file: File, signal: AbortSignal) {
  const format = file.name.split(".").at(-1)?.toLowerCase();
  if (!["pdf", "doc", "docx", "txt", "md"].includes(format || "")) throw new Error("Use PDF, DOC, DOCX, TXT or Markdown.");
  if (!file.size || file.size > 10_000_000) throw new Error("Upload a nonempty requirement file up to 10 MB.");
  const id = randomUUID(), root = directory(userId, id), bytes = Buffer.from(await file.arrayBuffer());
  await mkdir(join(root, "source"), { recursive: true }); await mkdir(join(root, "generated"));
  try {
    const result = await dockerTool<{ segments?: RequirementDocument["segments"]; warnings?: string[]; pages?: DocumentPage[]; error?: string }>(root, { action: "document", format, data: bytes.toString("base64") }, signal);
    if (result.error) throw new Error(result.error);
    const document = documentSchema.parse({ id, format, fileName: file.name, sha256: createHash("sha256").update(bytes).digest("hex"), segments: result.segments, warnings: result.warnings, pages: result.pages });
    await writeFile(join(root, "original"), bytes, { mode: 0o600 });
    await writeFile(join(root, "document.json"), JSON.stringify(document), { mode: 0o600 });
    return document;
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
export async function loadRequirements(userId: string, id: string) {
  return (await originalRequirements(userId, id)).document;
}
export async function originalRequirements(userId: string, id: string) {
  const root = directory(userId, id);
  const [metadata, bytes] = await Promise.all([readFile(join(root, "document.json"), "utf8"), readFile(join(root, "original"))]);
  const document = documentSchema.parse(JSON.parse(metadata));
  if (document.id !== id || createHash("sha256").update(bytes).digest("hex") !== document.sha256) throw new DocumentIntegrityError("The saved requirement document failed its integrity check. Upload the original again.");
  return { document, bytes };
}
export function documentRules(document: RequirementDocument, ids: string[]) {
  if (!ids.length || ids.length > 12 || new Set(ids).size !== ids.length) throw new Error("Select 1–12 unique requirement blocks.");
  const selected = ids.map(id => { const segment = document.segments.find(item => item.id === id); if (!segment) throw new Error("Unknown requirement block."); return segment; });
  if (selected.reduce((sum, item) => sum + item.text.length, 0) > 12000) throw new Error("Selected requirements exceed 12,000 characters. Select a smaller section.");
  return selected.map((segment, index) => ({ id: "R" + (index + 1), text: segment.text, source: { documentId: document.id, segmentId: segment.id, fileName: document.fileName, sha256: document.sha256, location: segment.location, page: segment.page, paragraph: segment.paragraph, line: segment.line, extraction: segment.extraction, confidence: segment.confidence } as RequirementSource }));
}
