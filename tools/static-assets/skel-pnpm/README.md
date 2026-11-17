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

The app uses Meteor's default `autoInstallDeps` behavior, allowing Meteor to
keep its required Rspack dependencies compatible using pnpm. Meteor tries a
directly available pnpm command first and then Corepack; if neither succeeds,
it prints workspace-aware commands before stopping so you can complete the
install manually. Set `meteor.autoInstallDeps` to `false` only when you want to
manage those dependencies yourself.

Add your own npm dependencies with pnpm from the workspace root or the relevant
workspace package. You can use Corepack when it is installed
(`corepack pnpm ...`) or Meteor's bundled npx
(`meteor npx pnpm@10.13.1 ...`).
