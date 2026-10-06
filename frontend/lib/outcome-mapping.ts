import type { VerificationReport } from "./types";

export const OUTCOME_MAPPING_VERSION = 1;

export function requirementOutcomes(
  report: VerificationReport,
  requirementId: string,
) {
  const scenarioIds = new Set(
    report.test_plan?.scenarios
      .filter((scenario) => scenario.requirement_ids.includes(requirementId))
      .map((scenario) => scenario.id) ?? [],
  );
  return report.executions.filter((execution) =>
    report.generated_tests.some(
      (test) =>
        test.validation_status === "validated" &&
        test.id === execution.test_id &&
        test.module === execution.module &&
        test.validated_checks?.some(
          (check) =>
            scenarioIds.has(check.scenario_id) &&
            check.function_name === execution.name,
        ),
    ),
  );
}
