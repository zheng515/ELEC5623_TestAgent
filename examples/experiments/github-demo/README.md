# Pinned GitHub regression input

Source: https://github.com/qajua/reqtest-shipping-demo/tree/e5e22a108ede7d1ca0288de0139d27b996c6291b

This is the saved public demo snapshot from the previously missed boundary run.
The complete docs/SRS.md, including repeated acceptance-table IDs and supporting
context, is sent through the production parser. Project documents are kept exactly
as submitted, including DEMO_RESULTS.md, which discusses the seeded fault. This
is a known development regression, not a blind benchmark or novel discovery claim.

Three fresh B3 runs measure variation on the pinned source and full SRS. Corrected
copy probes test whether generated failures disappear after the external threshold
patch. Source and requirements remain unchanged between repeats. No website run
history or account credentials are exported. The independent standalone benchmark
uses different projects without demo-result hints.

npm run evaluate -- examples/experiments/github-demo/manifest.json
