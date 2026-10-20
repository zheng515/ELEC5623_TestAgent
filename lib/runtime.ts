export type ProjectRuntime = "python" | "node";
export const sourceFile = (file: string) => /\.(py|[cm]?[jt]sx?)$/.test(file);
export const testFile = (id: string, runtime: ProjectRuntime = "python") => "reqtest_generated/test_reqtest_" + id + (runtime === "node" ? ".test.ts" : ".py");
