import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RuntimeEnvironment } from "../components/runtime-environment";
import type { ExecutionEnvironment } from "../lib/types";

afterEach(cleanup);
const environment: ExecutionEnvironment = {
  requested_image: "sandbox:1",
  image_id: "sha256:image-id",
  repo_digests: [],
  image_os: "linux",
  image_architecture: "arm64",
  python_version: "3.11.17",
  platform: "Linux-aarch64",
  packages: [{ name: "pytest", version: "9.1.1" }],
  fingerprint: "environment-hash",
};
it("shows actual image identity and installed versions", () => {
  render(<RuntimeEnvironment environment={environment} />);
  expect(screen.getByText("sha256:image-id")).toBeTruthy();
  expect(screen.getByText("environment-hash")).toBeTruthy();
  expect(screen.getByText("3.11.17")).toBeTruthy();
  expect(screen.getByText("pytest")).toBeTruthy();
  expect(screen.getByText("9.1.1")).toBeTruthy();
});
it("keeps historical runtime metadata unknown", () => {
  render(<RuntimeEnvironment />);
  expect(screen.getByText(/Runtime versions are unknown/)).toBeTruthy();
});
it("shows preparation failure rather than inventing environment metadata", () => {
  render(<RuntimeEnvironment error="Sandbox dependency probe timed out." />);
  expect(screen.getByText("Sandbox dependency probe timed out.")).toBeTruthy();
  expect(screen.queryByText("Pinned execution environment")).toBeNull();
});
