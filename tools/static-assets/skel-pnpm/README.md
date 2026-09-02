# Meteor pnpm monorepo

This pnpm workspace keeps Meteor applications in `apps/` and reusable npm
packages in `packages/`. pnpm installs and links everything from this root.

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

Dependencies are installed by `meteor create`. Start the app from the workspace
root:

```sh
meteor npm start
```

You can also run Meteor directly from the application directory:

```sh
cd apps/app
meteor run
```

The app sets `meteor.autoInstallDeps` to `false` because pnpm owns dependency
installation for the workspace. Add npm dependencies with pnpm from the
workspace root or the relevant workspace package. You can use Corepack when it
is installed (`corepack pnpm ...`) or Meteor's bundled npx
(`meteor npx pnpm@10.13.1 ...`).
