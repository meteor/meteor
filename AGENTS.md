# Meteor

Full-stack JavaScript platform for modern web and mobile applications.

## Commands

```bash
./meteor run                                 # Run from source
./meteor create my-app                       # Create app
./meteor self-test                           # CLI tests
./meteor test-packages ./packages/<name>     # Package tests (browser UI at localhost:3000)
./packages/test-in-console/run.sh "<name>"   # Package tests (terminal output via Puppeteer)
npm run test:unit                            # Unit tests (Jest)
npm run test:e2e                             # E2E tests (Jest + Playwright)
```

> **Note:** `./meteor test-packages` starts a web server and waits for a browser —
> it produces no terminal output. For automated/headless runs, use
> `./packages/test-in-console/run.sh "<package>"` instead, which runs the same tests
> via Puppeteer and prints pass/fail results to stdout.

## Structure

```
packages/          # Core Meteor packages (~100+)
tools/             # CLI & build system (Isobuild)
npm-packages/      # Published @meteorjs/* packages
scripts/           # Build & release automation
```

## Key Entry Points

| Task | Location |
|------|----------|
| CLI commands | `tools/cli/commands.js` |
| Build system | `tools/isobuild/bundler.js` |
| Package lookup | `packages/<name>/package.js` |
| Modern bundler | `packages/rspack/`, `packages/tools-core/` |

## Skills

Load these for detailed context on specific topics:

| Skill | When to use |
|-------|-------------|
| [codebase](.github/skills/codebase/SKILL.md) | Build system, CLI, isobuild, tools/ directory |
| [conventions](.github/skills/conventions/SKILL.md) | Writing packages, CLI commands, code patterns |
| [testing](.github/skills/testing/SKILL.md) | Writing tests, debugging failures, test infrastructure |
| [packages](.github/skills/packages/SKILL.md) | Finding packages by feature, understanding dependencies |
| [modern-tools](.github/skills/modern-tools/SKILL.md) | tools-core utilities, rspack, modern integrations |
| [ai-context](.github/skills/ai-context/SKILL.md) | Creating, updating, or maintaining AI documentation files |

## Package Domains

| Category | Packages |
|----------|----------|
| Auth | `accounts-base`, `accounts-password`, `accounts-oauth` |
| Database | `mongo`, `minimongo`, `ddp-server`, `ddp-client` |
| Build | `babel-compiler`, `ecmascript`, `typescript`, `rspack` |
| Web | `webapp`, `autoupdate`, `reload` |
| Reactivity | `tracker`, `reactive-var`, `reactive-dict` |

## Notes

- `docs/` and `guide/` are the public documentation website, not agent context
- `v3-docs/` contains Meteor 3.x documentation
- See [DEVELOPMENT.md](DEVELOPMENT.md) for contributor setup
