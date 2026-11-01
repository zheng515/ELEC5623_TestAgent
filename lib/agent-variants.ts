// Configured capabilities, not claims that every stage completed in a given run.
export const agentVariants = {
  B0: { name: 'Direct LLM', retrievedEvidence: false, requirementAnalysis: false, executionFeedback: false, mutationGuidance: false, failureDiagnosis: false },
  B1: { name: 'Grounded Test Generator', retrievedEvidence: true, requirementAnalysis: false, executionFeedback: false, mutationGuidance: false, failureDiagnosis: false },
  B2: { name: 'Full Agent without Failure Diagnosis', retrievedEvidence: true, requirementAnalysis: true, executionFeedback: true, mutationGuidance: true, failureDiagnosis: false },
  B3: { name: 'Full Verification Agent', retrievedEvidence: true, requirementAnalysis: true, executionFeedback: true, mutationGuidance: true, failureDiagnosis: true },
} as const;

export type AgentVariant = keyof typeof agentVariants;
export type ConfiguredAgentFeatures = { [Key in keyof typeof agentVariants.B3]: Key extends 'name' ? string : boolean };
