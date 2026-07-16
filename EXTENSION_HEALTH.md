# Android Command Center Health

Last updated: 2026-07-16

This file reports evidence, not an estimated quality score. A blank or untested area is not treated as healthy.

## Current release signal

- Release readiness: **Not ready for prime time**
- Extension code tests: **19/19 passing**
- Android fixture variants: **2/2 assembled and unit-tested** (`fullDebug`, `minimalDebug`)
- Manually verified sections with saved evidence: **0/9 passing**
- Known open bugs: **0**
- Fixed pending manual rerun: **5** — BUG-002 through BUG-006
- Verified fixes: **1** — BUG-001

## Coverage matrix

| Section | Automated evidence | Manual evidence | Known open defects | Current confidence |
| --- | --- | --- | --- | --- |
| Build | Variant parsing, action availability, and APK-picker cancellation wiring pass | Not run | None recorded | Partial only |
| Devices | ADB parsing and fake no/offline/unauthorized/multiple-device contracts pass | Not run | None recorded | Partial only |
| Deeplinks | URI validation passes; full fixture routes compile | Not run | None recorded | Partial only |
| Inspector | Webview syntax validation and inspectable fixture compile | Not run | None recorded | Low |
| Database | SQL safety, Scan wiring, missing-SQLite, and WAL-copy regressions pass | Previous error-14 failure is fixed in automation; screenshot-backed rerun pending | None recorded | Partial only |
| App data | Observable cache/data fixture compiles | Not run | None recorded | Low |
| Location | Coordinate validation and emulator-target requirements pass | Not run | None recorded | Partial only |
| Stream | Tagged log fixture compiles | Not run | None recorded | Low |
| Toolchain | Fake Android CLI/ADB contracts and SQLite dependency wiring pass | Not run; screenshot pass was deferred | None recorded | Partial only |

## What the bug ledger means

`BUGS.md` contains every bug currently known and recorded. It is a lower bound, not proof that no other bugs exist. Unknown bugs remain likely anywhere the matrix says **Not run**, **Low**, or **Partial only**.

Confidence increases only when a test has all of the following:

1. a written expected result in `TEST_PLAN.md`;
2. an automated assertion or exact manual procedure;
3. a result against the current revision;
4. terminal/device evidence and, for UI behavior, a screenshot;
5. a bug entry for every failure;
6. a rerun after the fix.

## Manual evidence convention

Save future evidence under:

```text
test-artifacts/manual/YYYY-MM-DD/
  build/
  devices/
  deeplinks/
  inspector/
  database/
  app-data/
  location/
  stream/
  toolchain/
```

Each section should also have a `results.md` containing the extension revision, test-app revision, environment, scenario, expected result, actual result, Pass/Fail, and screenshot links.

Do not mark a section manually verified because its UI was merely opened. The happy path and the planned negative states must both have evidence.

## Exit criteria

The extension can reasonably be called release-ready when:

- all P0/P1 bugs are closed and rerun;
- every section has a screenshot-backed happy-path pass;
- every supported fake toolchain/device state has a recorded pass or intentional limitation;
- the real emulator matrix passes on the current revision;
- the full automated suite remains green;
- remaining P2/P3 bugs are explicitly accepted or scheduled.
