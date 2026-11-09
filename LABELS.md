## Labels

Labels are defined in [`.github/labels.yml`](.github/labels.yml) and applied to the repository by the [Labels workflow](.github/workflows/labels.yml). To add, rename or remove a label, open a pull request on that file: a label created in the repository settings and missing from the manifest is deleted by the next run.

Every label belongs to one facet, written as a prefix, so the label picker groups them and searches read well: `is:open label:"area: ddp" label:"status: needs-triage"`.

### `type:` what the item is

One per item.

- `type: bug`: something does not work as documented or as it used to. Preset by the bug report template.
- `type: feature`: new behavior or capability.
- `type: docs`: documentation is missing, wrong or unclear.
- `type: maintenance`: repository chores (CI, tooling, dependencies, refactors without behavior change). These items get no area.
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

One per open issue. Pull requests use GitHub's own states (draft, review, merged) instead.

- `status: needs-triage`: new, nobody looked at it yet. Preset by the bug report template.
- `status: needs-reproduction`: a minimal reproduction is needed before anyone can work on it.
- `status: needs-info`: waiting for information from the author.
- `status: confirmed`: reproduced or accepted; the cause or the design is still open.
- `status: in-discussion`: the approach is still being discussed.
- `status: ready`: clear and accepted, nobody on it yet. Pick it up.
- `status: in-progress`: someone is working on it.
- `status: blocked`: waiting on something else (a release, another pull request, a decision).
- `status: stale`: no human comment for 90 days. The weekly [inactive issues script](.github/scripts/inactive-issues.js) adds it, and removes it on its next run after a human comments. It never closes anything.

The usual path: `needs-triage` → `needs-reproduction`, `needs-info` or `confirmed` (or closed with GitHub's "duplicate" or "not planned" reason) → `in-discussion` when the fix is not obvious, `ready` when it is → `in-progress`.

Issues waiting for triage: [`is:issue is:open label:"status: needs-triage"`](https://github.com/meteor/meteor/issues?q=is%3Aissue+is%3Aopen+label%3A%22status%3A+needs-triage%22).

### `priority:` the roadmap

Set by the Meteor Software team, since it reflects their planning.

- `priority: critical`: breaks production apps or every user; may justify a backport.
- `priority: next`: planned for the next releases.
- `priority: candidate`: considered for the roadmap, not committed yet.
- `priority: low`: valid, but not soon.

### Standalone labels

- `experimental`: exploration or proof of concept, with no commitment to adopt it. It combines with any type, status or priority: a proof of concept inside planned work is `priority: next` + `experimental`, a pure exploration has no priority at all.
- `good first issue`: a good first contribution for someone new to the codebase.
- `help wanted`: accepted and open to community contributions.
- `hacktoberfest-accepted`: accepted for [Hacktoberfest](https://hacktoberfest.com/).
- `dependencies`: pull requests that update a dependency (Dependabot).
