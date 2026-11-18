## Labels

Labels are defined in [`.github/labels.yml`](.github/labels.yml) and applied to the repository by the [Labels workflow](.github/workflows/labels.yml). To add, rename or remove a label, open a pull request on that file: a label created in the repository settings and missing from the manifest is deleted by the next run. A rename takes a `from_name` line with the current name, to remove in a later pull request: while it is there, the workflow leaves that label's color and description alone.

Every label belongs to one facet, written as a prefix, apart from the few standalone labels listed at the end, so the label picker groups them and searches read well: `is:open label:"area: ddp" label:"status: needs-triage"`.

### `type:` what the item is

One per item.

- `type: bug`: something does not work as documented or as it used to. Preset by the bug report template.
- `type: feature`: new behavior or capability.
- `type: docs`: documentation is missing, wrong or unclear.
- `type: maintenance`: repository chores (CI, tooling, dependencies, refactors without behavior change). An area applies only when the change sits in one, a dependency bump in a package for instance; CI and repository tooling have none.
- `type: security`: security hardening. Report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

### `area:` which part of Meteor

One or more per item. Pull requests get them automatically from the paths they change ([`.github/labeler.yml`](.github/labeler.yml)); on issues, a triager adds them (a best guess is fine).

| Area | Covers |
|---|---|
| `area: accounts` | accounts-*, password, passwordless, 2FA, OAuth and login services, roles |
| `area: blaze` | Blaze integration in this repository (Blaze itself lives in [meteor/blaze](https://github.com/meteor/blaze)) |
| `area: build` | Isobuild, compilers, minifiers, modules, HMR, CSS, Babel and SWC |
| `area: cli` | the `meteor` command: tool, shell, installer, version solver, self-tests |
| `area: core` | runtime packages: meteor, core-runtime, EJSON, check, logging, random |
| `area: create` | `meteor create`, skeletons and example apps |
| `area: ddp` | DDP client and server, transports, methods and subscriptions |
| `area: docs` | pull requests that change the docs or the guide and nothing else |
| `area: instrumentation` | instrumentation and OpenTelemetry, while this roadmap front is active (then `area: core`) |
| `area: livequery` | oplog, change streams and the observe drivers |
| `area: minimongo` | Minimongo: client collections, selectors, modifiers, observe |
| `area: mobile` | Cordova, Capacitor, iOS and Android builds |
| `area: mongo` | Mongo collections and driver, allow/deny, npm-mongo |
| `area: offline` | the offline package and the PWA skeleton, while this roadmap front is active (then `area: webapp`) |
| `area: packages` | other core packages: email, fetch, url, deprecated and imported packages |
| `area: reactivity` | Tracker, reactive-var, reactive-dict, session |
| `area: release` | release process, packaging and version bumps |
| `area: rspack` | the Rspack bundler integration (the modern build stack) |
| `area: testing` | the test harness: tinytest, test-in-*, e2e (not the self-tests that come with a CLI change) |
| `area: types` | TypeScript declarations and type tests |
| `area: webapp` | webapp, boilerplate, browser policy, autoupdate, server rendering |

`platform: windows` marks items specific to Windows. It combines with any area.

### `status:` where the item stands

One per open issue, plus `status: stale` next to it when the issue goes quiet. Pull requests use GitHub's own states (draft, review, merged) instead.

- `status: needs-triage`: new, nobody looked at it yet. Preset by the bug report template.
- `status: needs-reproduction`: a minimal reproduction is needed before anyone can work on it.
- `status: needs-info`: waiting for information from the author.
- `status: confirmed`: reproduced or accepted; the cause or the design is still open.
- `status: in-discussion`: the approach is still being discussed.
- `status: ready`: clear and accepted, nobody on it yet. Pick it up.
- `status: in-progress`: someone is working on it.
- `status: blocked`: waiting on something else (a release, another pull request, a decision).
- `status: stale`: no human comment for 90 days. The weekly [inactive issues script](.github/scripts/inactive-issues.js) adds it next to the status the issue already has, and removes it on its next run after a human comments or once the issue is `status: in-progress`, so the issue is back where it stood. It never closes anything.

The usual path: `needs-triage` → `needs-reproduction`, `needs-info` or `confirmed` (or closed with GitHub's "duplicate" or "not planned" reason) → `in-discussion` when the fix is not obvious, `ready` when it is → `in-progress`.

Issues waiting for triage: [`is:issue is:open label:"status: needs-triage"`](https://github.com/meteor/meteor/issues?q=is%3Aissue+is%3Aopen+label%3A%22status%3A+needs-triage%22).

### `legacy:` issues from before 3.0

For issues reported before 3.0 shipped (on 0.x, 1.x, 2.x or a 3.0 beta or release candidate) that may not apply to 3.x. They combine with any status.

- `legacy: needs-review`: may only affect releases before 3.0, someone needs to check it on 3.x. The [Labels workflow](.github/workflows/labels.yml) adds it to the open issues opened before July 15, 2024, feature requests aside, and never adds it back once removed; triagers add it to later issues reported on an older release. If it still reproduces on 3.x, remove the label and keep going with the usual flow.
- `legacy: pre-3 only`: confirmed to affect only releases before 3.0. Replace `legacy: needs-review` with it and close the issue as "not planned", with a short comment on what was checked and the fix or alternative on 3.x.

Issues to check: [`is:issue is:open label:"legacy: needs-review"`](https://github.com/meteor/meteor/issues?q=is%3Aissue+is%3Aopen+label%3A%22legacy%3A+needs-review%22).

### `priority:` the roadmap

Set by the Meteor Software team, since it reflects their planning.

- `priority: critical`: breaks production apps or every user; may justify a backport.
- `priority: next`: planned for the next releases.
- `priority: candidate`: considered for the roadmap, not committed yet.
- `priority: low`: valid, but not soon.

### `ci:` switches for the E2E workflow

Reserved for the E2E smart triggering of [#14479](https://github.com/meteor/meteor/pull/14479): once it lands, they choose which E2E slices a pull request runs, `ci:e2e` for all of them, `ci:e2e:apps`, `ci:e2e:skeletons` and `ci:e2e:examples` for one group each. `ci:e2e:native` is set aside for the native smoke tests.

### Standalone labels

- `experimental`: exploration or proof of concept, with no commitment to adopt it. It combines with any type, status or priority: a proof of concept inside planned work is `priority: next` + `experimental`, a pure exploration has no priority at all.
- `good first issue`: a good first contribution for someone new to the codebase.
- `help wanted`: accepted and open to community contributions.
- `hacktoberfest-accepted`: accepted for [Hacktoberfest](https://hacktoberfest.com/).
- `dependencies`: pull requests that update a dependency (Dependabot).
