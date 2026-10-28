# Independent component review

This development pack contains original requirements, source, candidate tests and actual disposable Docker executions. It contains no model predictions or draft reference decisions. Execution pass/fail is not a correctness label.
Read each original rule and every assertion. Ignore scaffolding purpose and mapping metadata as evidence of correctness. Use the recorded trace to distinguish a generated import/setup error from an implementation dependency blocker. A passing test can still be unsupported or omit a stated obligation.

Copy reference.template.json to a separate reference.json. For test_review use exactly one of supported or blocked. For diagnosis use generated_test_error, requirement_ambiguity, potential_implementation_defect, environment_failure or uncertain. Explain each choice with exact requirement, file and execution evidence. Use multiple acceptable diagnosis labels only when a unique label cannot be justified; such cases are excluded from confusion/Macro-F1 scoring.
Review independently before viewing model outputs or the repository draft labels. Resolve disagreements explicitly, retain the original annotation, enter your name and set reviewed=true only after all cases are checked. The software checks completeness and fingerprints; it cannot verify reviewer independence.

Use the reviewed reference in a separately frozen run: npm run evaluate:decisions -- 3 --reference /absolute/path/reference.json
To annotate an existing run, first confirm the dataset hashes match, then place the completed reference at that run's reference.json and run npm run evaluate:decisions -- score RUN_DIRECTORY. Never change frozen inputs to match labels.
These cases are development fixtures, not a held-out or industry sample. Model review/diagnosis classification is separate from whole-agent admission and diagnosis grounding.
