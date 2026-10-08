import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RepositoryVersion } from "../components/repository-version";
import { ExecutionHistory } from "../components/execution-history";
import type { RepositorySnapshot, VerificationReport } from "../lib/types";

afterEach(cleanup);
const repository: RepositorySnapshot = {
  root: "/original",
  sha256: "interface-hash",
  modules: [],
  skipped: [],
  truncated: false,
  artifact: {
    id: "snapshot-id",
    content_sha256: "content-hash",
    directories: [],
    files: [{ path: "shipping.py", size: 64, sha256: "file-hash", mode: 292 }],
    excluded: [".git/: excluded directory"],
  },
};
it("shows the saved content version and excluded paths", () => {
  render(<RepositoryVersion repository={repository} />);
  expect(screen.getByText("content-hash")).toBeTruthy();
  expect(screen.getByText("shipping.py")).toBeTruthy();
  expect(screen.getByText(".git/: excluded directory")).toBeTruthy();
  expect(
    screen.getByText(/Original directory|original directory/),
  ).toBeTruthy();
});
it("links a downloaded GitHub repository to the exact commit that was read", () => {
  render(
    <RepositoryVersion
      repository={{
        ...repository,
        source: {
          provider: "github",
          repository: "example/shipping",
          url: "https://github.com/example/shipping/tree/abc123/pkg",
          requested_ref: "main",
          ref: "main",
          commit_sha: "abc123",
          subdirectory: "pkg",
        },
      }}
    />,
  );
  expect(
    screen.getByRole("link", { name: "example/shipping" }).getAttribute("href"),
  ).toBe("https://github.com/example/shipping/tree/abc123/pkg");
  expect(screen.getByText("abc123")).toBeTruthy();
  expect(screen.getByText("pkg")).toBeTruthy();
});
it("shows no GitHub origin for a local repository", () => {
  render(<RepositoryVersion repository={repository} />);
  expect(screen.queryByText("GitHub")).toBeNull();
});
it("does not mistake legacy interface hashes for an executed content version", () => {
  render(
    <RepositoryVersion repository={{ ...repository, artifact: undefined }} />,
  );
  expect(screen.getByText(/No saved code snapshot/)).toBeTruthy();
  expect(screen.queryByText("interface-hash")).toBeNull();
});
it("shows the content fingerprint bound to each execution attempt", () => {
  const report: VerificationReport = {
    repository,
    requirements: [],
    summary: "Done",
    generated_tests: [],
    behaviors: [],
    evidence: [],
    unresolved_issues: [],
    coverage_gaps: [],
    executions: [],
    executed_tests: 0,
    execution_success_rate: null,
    requirement_coverage: null,
    execution_attempts: [
      {
        number: 1,
        stage: "measure",
        created_at: "2026-10-06T00:00:00Z",
        tests: [],
        diagnoses: [],
        result: {
          executions: [],
          exit_code: 0,
          timed_out: false,
          stderr_excerpt: "",
          repository_content_sha256: "executed-content-hash",
        },
      },
    ],
  };
  render(<ExecutionHistory report={report} />);
  expect(screen.getByText("executed-content-hash")).toBeTruthy();
});
