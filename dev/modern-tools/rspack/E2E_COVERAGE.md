# E2E Test Coverage

> To update this report, follow the [e2e-coverage skill](/.github/skills/e2e-coverage/SKILL.md).

End-to-end tests using Jest + Playwright that verify Meteor apps with the Rspack bundler across frameworks, build modes, and features.

Test infrastructure lives in `tools/e2e-tests/`, with app fixtures in `tools/e2e-tests/apps/` and matching test files at `tools/e2e-tests/<name>.test.js`.

## Test Lifecycle

Every app and skeleton goes through these phases (unless skipped):

| Phase | What it does |
|-------|-------------|
| **Init** | Copies app, installs deps, adds rspack, generates config |
| **Run (dev)** | `meteor run` — asserts build artifacts, app loads, client/server hot rebuild |
| **Run (prod)** | `meteor run --production` — same checks in production mode |
| **Test** | `meteor test` — runs mocha test driver, verifies test rebuild |
| **Test once** | `meteor test --once` — runs tests to completion, checks exit code |
| **Build** | `meteor build` — verifies bundle structure (main.js, programs/server, web.browser, web.browser.legacy) |
| **Reset** | `meteor reset` — clears rspack build artifacts, caches, asset/chunk context dirs, and `.meteor/local` subdirectories |

Default assertions on every run phase: build artifacts exist, page title matches, body styles render, `__rspack__` script tag is present.

---

## Apps

Each app lives in `apps/<name>/` and has a matching `<name>.test.js`.

### react

Core React integration with custom Meteor local directory.

| What is covered | Phase |
|----------------|-------|
| Custom `METEOR_LOCAL_DIR` (`.meteor/local-custom`) | All (env prefix) |
| Custom build dir (`_build-local-custom`) created | Run |
| `.gitignore` updated with custom local dir | Run |
| React + JSX environment detection | Run, Prod, Test, Build |
| Image assets load (generated + public + background) | Run, Prod |
| `Meteor.disablePlugins` suppresses rspack plugins | Run, Prod, Test, Build |
| Unplugin transform hook fires on first run (fresh cache) | Init |
| Unplugin factory created on cached run — #14031 regression | Run |
| Unplugin transform + buildDependencies tracking in production | Prod |
| Custom rspack config (`rspack.config.cjs`) | All |
| HMR works in dev, disabled in prod | Run, Prod |

### react-router

Full-featured React Router app with custom packages, Less, and advanced rspack config.

| What is covered | Phase |
|----------------|-------|
| `METEOR_PACKAGE_DIRS` custom packages dir | All (env prefix) |
| `babel-plugin-react-compiler` integration | Init, Prod, Build |
| Compiler output cached in dev (babel.config.js) | Run |
| 404 page routing (renders "Page Not Found") | Run, Prod |
| Less stylesheet support (`white-space: break-spaces`) | Run, Prod |
| `meteor.modules` config styles (`align-content: center`) | Run, Prod |
| Custom HTML meta tags (`theme-color`) | Run, Prod |
| Default + custom package loading | Run |
| `resolve.extensions` loading (`.jsx`) | Run |
| `rspack.config.override.js` custom plugin loading | Run, Test, Build |
| React + TSX environment detection | Run, Prod, Test, Build |
| Full-app test mode (`--full-app`) | Test |
| Static assets in bundle (png, md) | Build |
| HMR works in dev, disabled in prod | Run, Prod |

### blaze

Blaze templating engine integration.

| What is covered | Phase |
|----------------|-------|
| Blaze environment detection (`isBlazeEnabled`) | Run, Prod, Test, Build |
| HMR disabled (incompatible with Blaze) | Run, Prod |

### full-blaze

Full Blaze app (with `imports/` structure for tests).

| What is covered | Phase |
|----------------|-------|
| Blaze environment detection | Run, Prod, Test, Build |
| `imports/api/` test path structure | Test |
| HMR disabled (incompatible with Blaze) | Run, Prod |

### typescript

TypeScript with SCSS, type checking, `.ts` rspack config, and `.ts` SWC config.

| What is covered | Phase |
|----------------|-------|
| TypeScript rspack config (`rspack.config.ts`) | All |
| TypeScript SWC config (`swc.config.ts`) with automatic JSX runtime | All |
| `@swc/core` type-only import for SWC config typings | All |
| Custom build dir (`build`) | All |
| Custom asset/chunk context dirs (`assets`, `chunks`) | All |
| SCSS styles support (`white-space: break-spaces`) | Run, Prod |
| TypeScript + TSX environment detection | Run, Prod, Test, Build |
| Portable build (Meteor.isDevelopment/isProduction not defined) | Run, Prod, Build |
| `Meteor.extendSwcConfig` with path aliases (`@ui/*`, `@api/*`) | All |
| `TsCheckerRspackPlugin` type checking (no errors) | Run |
| `.meteor/local/types` directory generated | Run |
| Separate client/server test files | Test |
| CI: removes TsCheckerRspackPlugin (resource limits) | Init |
| HMR works in dev, disabled in prod | Run, Prod |

### babel

Babel transpilation with custom module rules and `.mjs` rspack config.

| What is covered | Phase |
|----------------|-------|
| Custom rspack config (`rspack.config.mjs`) | All |
| Custom `NODE_ENV` compilation per phase | All (env prefix) |
| Rspack mode assertion (development/production) | Run, Prod, Test, Build |
| `Meteor.isDevelopment`/`Meteor.isProduction` defines | Run, Prod, Test, Build |
| Module rules for `.js`/`.jsx` files | Run, Prod, Test, Build |
| Module rules for `.tsx`/`.ts`/`.mts`/`.cts`/`.mjs`/`.cjs` | Run, Prod, Test, Build |
| Module rules for `.graphql`/`.gql` files | Run, Prod, Test, Build |
| Default rules negated (custom rules override) | Run, Prod, Test, Build |
| HMR works in dev, disabled in prod | Run, Prod |

### coffeescript

CoffeeScript language support.

| What is covered | Phase |
|----------------|-------|
| `.coffee` file compilation (client + server + test) | All |
| CoffeeScript-specific conditional syntax | Run, Prod |
| HMR works in dev, disabled in prod | Run, Prod |

### vue

Vue.js framework with Tailwind CSS, CSS auto-delegation, and `meteor.modules` config.

| What is covered | Phase |
|----------------|-------|
| Vue single-file components | All |
| Tailwind CSS styles (`.p-8` padding) | Run, Prod |
| CSS auto-delegation (`client/main.css` processed by Rspack, not Meteor) | All |
| `meteor.modules` config preserves `client/meteor.css` for Meteor processing | All |
| Rspack CSS + Meteor CSS coexistence in same entry folder | All |
| HMR works in dev, disabled in prod | Run, Prod |

### solid

SolidJS framework integration.

| What is covered | Phase |
|----------------|-------|
| SolidJS compilation and rendering | All |
| HMR works in dev, disabled in prod | Run, Prod |

### svelte

Svelte framework integration.

| What is covered | Phase |
|----------------|-------|
| Svelte compilation and rendering | All |
| HMR works in dev, disabled in prod | Run, Prod |

### monorepo

Monorepo structure with app in subdirectory, service worker, and PWA manifest.

| What is covered | Phase |
|----------------|-------|
| Monorepo layout (`app/` subdirectory) | All |
| Custom rspack config (`rspack.config.cjs`) | All |
| `rspack.config.override.cjs` custom plugin loading | Run, Test, Build |
| Static assets in bundle (png, md, icon, manifest) | Build |
| Service worker in production build (`sw.js` found in bundle tree) | Build |
| Service worker file served (`/sw.js`) | Run |
| Service worker registers, activates, controls page | Run |
| Service worker runtime caching (images) | Run |
| Service worker precaching (`/icon.png` via `additionalManifestEntries`) | Run |
| Service worker stability (`sw.js` not rewritten on rebuild) | Run |
| Service worker regenerated on restart (`sw.js` changed between runs) | Run, Prod |
| PWA manifest linked and fields validated | Run |
| Meta tags (`theme-color`) | Run |
| HMR works in dev, disabled in prod | Run, Prod |

### server-only

Server-only app (no client entry point).

| What is covered | Phase |
|----------------|-------|
| No client bundle (client skipped) | All |
| No client tests (test client skipped) | Test |
| Server entry loads (`server/main.js loaded`) | Run |

---

## Skeletons

Tested via `skeleton.test.js` using `meteor create --<skeleton>`. Each skeleton verifies: app creation, dev run, production run, test once, build, and reset.

| Skeleton | Port | Language | Extra coverage |
|----------|------|----------|----------------|
| angular | 3213 | TypeScript | |
| apollo | 3201 | JSX | |
| babel | 3212 | JSX | |
| bare | 3219 | JS | No title/style checks, no client tests, skip build cache check |
| blaze | 3202 | JS | |
| chakra-ui | 3203 | JSX | No body style checks (custom UI library) |
| coffeescript | 3211 | CoffeeScript | |
| full | 3204 | JS | `imports/api/` test structure |
| react | 3205 | JSX | Custom body styles (Inter font, padding) |
| solid | 3206 | JS | |
| svelte | 3207 | JS | |
| tailwind | 3208 | TypeScript | Tailwind `bg-gray-100` styles (dev + prod color formats) |
| typescript | 3209 | TypeScript | CI: removes TsCheckerRspackPlugin |
| vue | 3210 | JS | |

---

## NPM Package Compatibility

Several apps import specific npm packages to verify that Meteor + Rspack handles different module formats and edge cases without errors. The app boots successfully only if these imports resolve correctly.

### react-router (`apps/react-router/server/main.js`)

| Package | Reason |
|---------|--------|
| `s3mini` | ESM-only package (no CJS fallback) |
| `@modelcontextprotocol/sdk/client/streamableHttp.js` | ESM subpath export (deep path into ESM package) |
| `bcrypt` | Native Node.js bindings (compiled C++ addon) |
| `puppeteer` | Large ESM-compatible package with complex dependency tree (`server/browser-tests/browser.app-test.js`) |

### monorepo (`apps/monorepo/app/`)

| Package | File | Reason |
|---------|------|--------|
| `pino` + `pino-pretty` | `server/main.js` | ESM-first logger; `pino-pretty` uses `thread-stream` which has worker file resolution issues — needs `Meteor.compileWithMeteor(["thread-stream"])` in rspack config |
| `grubba-rpc` | `server/main.js` | Untranspiled npm dependency — needs `Meteor.compileWithRspack(["grubba-rpc"])` to compile it through rspack |
| `node:buffer` | `imports/api/links.js` | Node.js built-in via `node:` protocol in shared client/server code — must be ignored on client without errors |
| `@react-email/components` | `imports/emails/TestEmail.jsx` | JSX-heavy ESM package with many subpath exports |

### react (`apps/react/plugins/demo-unplugin.js`)

| Package | Reason |
|---------|--------|
| `unplugin` | Unplugin transform hook integration — validates rspack cache tracks plugin dependency files (#14031) |

### babel (`apps/babel/server/apollo.js`)

| Package | Reason |
|---------|--------|
| `@apollo/server` | ESM-first GraphQL server |
| `@apollo/server/express4` | ESM subpath export (middleware from deep path) |
| `graphql` | Peer dependency, dual CJS/ESM package |

### typescript (`apps/typescript/rspack.config.ts`, `apps/typescript/swc.config.ts`)

| Package | Reason |
|---------|--------|
| `node:module` (`createRequire`) | Node.js built-in in a `.ts` config file — tests CJS interop via `createRequire(import.meta.url)` in an ESM context |
| `@swc/core` | Type-only import (`import type { Config }`) — provides typings for `swc.config.ts`, stripped at compile time |

---

## Feature Coverage Matrix

Where each feature is tested across apps and skeletons.

| Feature | Apps | Skeletons |
|---------|------|-----------|
| HMR (dev) | react, react-router, babel, coffeescript, vue, solid, svelte, monorepo, typescript | |
| HMR disabled (prod) | all apps with HMR | |
| HMR incompatible | blaze, full-blaze | |
| Custom rspack config | react (.cjs), react-router, babel (.mjs), monorepo (.cjs), typescript (.ts) | |
| Custom SWC config (.ts) | typescript | |
| Config override file | react-router, monorepo | |
| Custom build dir | react, typescript | |
| Custom asset/chunk context dirs | typescript | |
| Custom env vars | react (METEOR_LOCAL_DIR), react-router (METEOR_PACKAGE_DIRS) | |
| Static asset bundling | react-router, monorepo (png, md, icon, manifest) | |
| Less styles | react-router | |
| SCSS styles | typescript | |
| Tailwind CSS | vue (PostCSS) | tailwind |
| Image asset loading | react | |
| 404 routing | react-router | |
| Meta tags | react-router, monorepo | |
| Babel compiler plugin | react-router | |
| TypeScript type checking | typescript | |
| Meteor.disablePlugins | react | |
| Unplugin transform with cache (#14031) | react | |
| Custom package dirs | react-router | |
| CoffeeScript compilation | coffeescript | coffeescript |
| Server-only (no client) | server-only | |
| Monorepo layout | monorepo | |
| Full-app test mode | react-router | |
| Module rules override | babel | |
| Custom NODE_ENV compilation | babel | |
| Portable build (no isDev/isProd defines) | typescript | |
| `Meteor.extendSwcConfig` (path aliases) | typescript | |
| CSS auto-delegation (entry folder filtering) | vue | |
| `meteor.modules` config (preserve files for Meteor) | react-router, vue | |
| `meteor reset` cleanup | all apps | all skeletons |
| Skeleton creation | | all 14 skeletons |
| Body style assertions | | react, tailwind (custom); most others (default) |
| Custom .gitignore entries | react | |
| ESM-only packages | react-router, monorepo, babel | |
| ESM subpath exports | react-router, babel | |
| Native bindings (C++ addon) | react-router | |
| `node:` protocol imports | monorepo, typescript | |
| Untranspiled npm deps (`compileWithRspack`) | monorepo | |
| Worker resolution (`compileWithMeteor`) | monorepo | |
| Service worker (Workbox GenerateSW) | monorepo | |
| Service worker stability (no rewrite on rebuild) | monorepo | |
| Service worker regenerated on restart | monorepo | |
| Service worker in production build | monorepo | |
| Service worker runtime caching (images) | monorepo | |
| Service worker precaching (`additionalManifestEntries`) | monorepo | |
| PWA manifest | monorepo | |
