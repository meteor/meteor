# Meteor pnpm Workspace

A minimal Meteor app inside a pnpm monorepo.

This skeleton keeps Meteor apps in `apps/` and shared code in `packages/`.
The app imports the workspace packages with `workspace:*` dependencies.

## Structure

```text
.
├── apps/
│   └── app/             # Meteor application
├── packages/
│   ├── domain/          # Shared client/server helpers
│   ├── server-tools/    # Server-only helper package
│   └── ui/              # Client UI helper package
└── pnpm-workspace.yaml
```

## Run

```sh
corepack pnpm install
cd apps/app
meteor run
```

Open http://localhost:3000.

## What This Demonstrates

- `apps/app/package.json` depends on local packages with `workspace:*`.
- `apps/app/rspack.config.cjs` compiles workspace package sources through Rspack.
- The browser renders content imported from `@example/ui` and `@example/shared`.
- The server imports `@example/shared` and `@example/server`.

The Meteor app sets `meteor.autoInstallDeps` to `false` because pnpm owns npm
dependency installation for this workspace.
