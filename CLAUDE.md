Read [AGENTS.md](AGENTS.md) before starting any task.

## Skills

Load these for detailed context on specific topics:

| Skill | When to use |
|-------|-------------|
| [codebase](.github/skills/codebase/SKILL.md) | Build system, CLI, isobuild, tools/ directory |
| [conventions](.github/skills/conventions/SKILL.md) | Writing packages, CLI commands, code patterns |
| [testing](.github/skills/testing/SKILL.md) | Test value, planning and refinement, change scope, test layers, and focused verification |
| [self-testing](.github/skills/self-testing/SKILL.md) | CLI contracts, sandboxed tool state, process assertions, and focused self-test execution |
| [package-testing](.github/skills/package-testing/SKILL.md) | Package runtime contracts, Tinytest, client/server placement, and asynchronous test execution |
| [e2e-testing](.github/skills/e2e-testing/SKILL.md) | E2E design, fixtures, assertions, isolation, CI groups, and coverage-report maintenance |
| [packages](.github/skills/packages/SKILL.md) | Finding packages by feature, understanding dependencies |
| [modern-tools](.github/skills/modern-tools/SKILL.md) | tools-core utilities, rspack, modern integrations |
| [sync-modern-tool-versions](.github/skills/sync-modern-tool-versions/SKILL.md) | Synchronizing modern-tool npm packages, dependency floors, constants, templates, and fixtures |
| [ai-context](.github/skills/ai-context/SKILL.md) | Creating, updating, or maintaining AI documentation files |
| [changelog](.github/skills/changelog/SKILL.md) | Writing, reviewing, or editing changelog entries for releases |
| [version-bump](.github/skills/version-bump/SKILL.md) | Bumping package versions for beta, RC, and official releases |
| [docs-gap](.github/skills/docs-gap/SKILL.md) | Analyzing release changes for missing user-facing documentation |

## Agent Setup

### Claude Code

**IMPORTANT:** Before using any skill, check if it is installed in `.claude/skills/`. If a skill is missing, install ALL skills by running:

```bash
for skill in .github/skills/*/; do
  name=$(basename "$skill")
  mkdir -p ".claude/skills/$name"
  ln -sf "../../../.github/skills/$name/SKILL.md" ".claude/skills/$name/SKILL.md"
  if [ -d "$skill/references" ] && [ ! -e ".claude/skills/$name/references" ]; then
    ln -s "../../../.github/skills/$name/references" ".claude/skills/$name/references"
  fi
done
```

This links skill entrypoints and any reference directories into `.claude/skills/` where Claude Code discovers them. The directory is gitignored; run this on setup and after skills gain references. Remove an obsolete shortcut when its source skill is retired.
