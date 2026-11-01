export type ProjectRuntime = "python" | "node";
export const sourceFile = (file: string) => /\.(py|[cm]?[jt]sx?)$/.test(file);
export const projectTestFile = (file: string, nodes: string[] = []) => nodes.some(node => node.split('::')[0] === file) || /(?:^|\/)(?:tests?|__tests__)\//.test(file) || /(?:^|\/)(?:conftest\.py|test_[^/]*\.py|[^/]*_test\.py|[^/]*\.(?:test|spec)\.[cm]?[jt]sx?)$/.test(file);
// A generated Python test that requests the sandbox browser fixtures.
export const browserTest = (code: string) => /def test_\w+\([^)]*\b(page|live_server)\b/.test(code);
export const testFile = (id: string, runtime: ProjectRuntime = "python") => "reqtest_generated/test_reqtest_" + id + (runtime === "node" ? ".test.ts" : ".py");
