# Node.js shipping demo

This small ESM project uses the built-in node:test runner and needs no packages.
Run npm test with Node.js 22 or newer. Existing tests cover an amount above the
threshold. The implementation intentionally excludes the exact threshold even
though SRS.md requires it. A supported generated threshold test should fail and
remain unchanged, with a potential implementation defect diagnosis.

Zip this directory, upload it to ReqTest and select automatic runtime detection.
Paste the single line from SRS.md. Automatic dependency setup is unnecessary.
This is a development/demo fixture, not an independent evaluation case.
