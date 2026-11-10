---
outline:
  level: [2, 3]
---

# Meteor Agent Skills

Meteor Agent Skills give compatible AI coding assistants focused guidance for building, debugging, migrating, testing, securing, and deploying Meteor 3 applications.

Skills are installed for your coding assistant, not as Atmosphere or npm dependencies in your application. A compatible assistant can match your request to a relevant skill, load its instructions when needed, and follow its Meteor-specific decision flow without adding the entire catalog to every conversation.

The catalog version identifies a snapshot of the skills, independently of the
Meteor version in your app. Guidance for Meteor 3.6 keeps explicit branches
for earlier supported Meteor and package versions. Check your app's resolved
versions before applying a release-specific capability.

The first official catalog is
[Agent Skills v1.1.0](https://github.com/meteor/agent-skills/releases/tag/v1.1.0),
verified with official Meteor 3.6. For a reproducible installation, use its
pinned command below or the plugin commands in its release notes. Unpinned
catalog sources follow the repository's default branch.

## Quick start

### Codex

Install the complete catalog as the Meteor plugin:

```bash
codex plugin marketplace add meteor/agent-skills
codex plugin add meteor@meteor
```

### Claude Code

Install the same catalog as a Claude Code plugin:

```bash
claude plugin marketplace add meteor/agent-skills
claude plugin install meteor@meteor
```

### Other compatible assistants

The open `skills` CLI can install the catalog into Claude Code, Cursor, Codex, Copilot, Gemini CLI, OpenCode, and other compatible assistants.

Requires Node.js 22.20.0 or later in the shell running `npx`, as specified by
[Skills CLI](https://github.com/vercel-labs/skills#install-a-skill). This is an
installer requirement; your Meteor application can keep its own Node version.
See the older-Node fallback below if your shell uses Node 20 or early Node 22.

Run the installation commands from your Meteor project root for a project-local
installation. Add `--global` for a user-wide installation.

List the available skills:

```bash
npx skills add meteor/agent-skills --list
```

Select skills interactively:

```bash
npx skills add meteor/agent-skills
```

Or pin the official catalog version:

```bash
npx skills add 'meteor/agent-skills#v1.1.0'
```

Install one skill directly:

```bash
npx skills add meteor/agent-skills --skill migrate-to-meteor-3
```

For every published skill, select the agent explicitly and skip the picker:

```bash
npx skills add meteor/agent-skills --agent codex --yes
```

For Node 20 or early Node 22, use the tested compatible installer:

```bash
npx skills@1.5.18 add meteor/agent-skills
```

Use the same installer pin for other Skills CLI commands on those runtimes.
For a full non-interactive install with this fallback, append `--agent codex --yes`.
Avoid `--all` in Skills CLI 1.5.18: it also selects internal maintainer skills
and all agents. See the
[full catalog and install options](https://github.com/meteor/agent-skills#install)
for other agents, plugin installations and manual ZIP downloads.

## How skills work

Each skill exposes a short description that tells an assistant when to use it. When a request matches, the assistant loads the full instructions and only the references or helper scripts needed for that task. Neighboring skills also define handoffs, such as moving from broad debugging to the build, data, testing, or deployment guidance after the failing layer is known.

After installation, start a fresh conversation so your assistant discovers the new skills. Ask for the Meteor task naturally. You do not need to name a skill in the prompt.

For example:

- Build a Meteor 3 application from scratch.
- Migrate this Meteor 2 application to Meteor 3.
- Review this publication and subscription flow.
- Diagnose why this Meteor test hangs.
- Audit this application for security issues.
- Validate this production deployment configuration.

## Skill coverage

The catalog focuses on Meteor workflows where framework context, version boundaries, and practical decisions are especially important.

| Scope | Skills | What they cover |
| --- | --- | --- |
| CLI installation and recovery | `meteor-cli-installation` | Installing or repairing the CLI, selecting releases, resolving PATH problems, and preparing retained local data before upgrades. |
| TypeScript and JavaScript declarations | `meteor-typescript` | Declaration providers, native Meteor 3.6 types, generation, compiler configuration, and JavaScript IntelliSense. |
| Native applications | `meteor-native` | Cordova setup, Android/iOS builds, device debugging, native plugins, and mobile release boundaries. |
| Meteor 3 migration | `migrate-to-meteor-3`, `migrate-to-rspack` | Fibers removal, async API migration, Promise call chains, package triage, and moving Meteor 3.4+ applications to Rspack. |
| Modern build stack and project setup | `meteor-modern-build-stack` | App scaffold selection, pnpm workspaces, SWC, file watching, Meteor Bundler optimizations, Rspack setup, version pairing, and build diagnostics. |
| Data and application APIs | `meteor-methods`, `meteor-pubsub`, `meteor-mongo-minimongo` | Methods, validation, latency compensation, publications, subscriptions, Mongo queries, indexes, Minimongo, oplog, and Change Streams. |
| User interfaces | `meteor-react`, `meteor-blaze` | Reactive data, Suspense, Fast Refresh, Spacebars, Tracker, async rendering, lifecycle behavior, and bundler-specific refresh behavior. |
| Application foundations | `meteor-accounts`, `meteor-security`, `meteor-testing` | Authentication, OAuth, password flows, authorization, rate limiting, CSP, unit and integration tests, and browser end-to-end testing. |
| Community packages | `meteor-community-packages` | Selecting and integrating packages from Meteor's documented community catalog while checking versions, ownership, behavior, support boundaries, and upstream repositories. |
| Debugging and operations | `meteor-debugging`, `meteor-deployment` | Evidence-first diagnosis across builds, runtime, data, tests, browsers, mobile, and production, plus Galaxy, Docker, Kubernetes, settings, and Node version matching. |

The current catalog targets Meteor 3. Most skills support Meteor 3.0 and later. The modern build stack skill starts with Meteor 3.3, and the Rspack migration skill starts with Meteor 3.4. The catalog has dedicated UI skills for React and Blaze, but does not yet include dedicated Vue, Svelte, or Solid skills.

## Curated bundles

You can install the complete catalog, one skill, or a curated group of related skills. The repository currently publishes these bundles:

| Bundle | Use it for |
| --- | --- |
| `essentials` | Core debugging, build, Methods, pub/sub, Mongo, and security work. |
| `migration` | Migrating to Meteor 3 or moving an existing Meteor 3 application to Rspack. |
| `fullstack` | Data, accounts, security, testing, and general full-stack application work. |
| `ops` | Debugging and production deployment. |
| `blaze` | Blaze-specific interface work. |
| `react` | React-specific interface work. |

See the [bundle catalog](https://github.com/meteor/agent-skills#bundles) for the exact skill membership and generated install commands.

## Working with Agent Skills

Agent Skills complement the Meteor documentation and your own review. They do not replace API documentation, application tests, or decisions based on your deployed Meteor and package versions.

## Feedback

Report problems in the [Meteor Agent Skills issue tracker](https://github.com/meteor/agent-skills/issues). Include:

- The prompt or task, with sensitive application details removed.
- The skill selected, or the skill you expected.
- The assistant client and model.
- Your Meteor release and relevant Atmosphere or npm package versions.
- The result, expected behavior, and a small reproduction or relevant logs when available.

Feedback about missed skill selection, incorrect commands or APIs, inaccurate version boundaries, missing decisions, and installation failures helps guide future updates.
