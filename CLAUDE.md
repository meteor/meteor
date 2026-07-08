Read [AGENTS.md](AGENTS.md) before starting any task.

## Skills

Load these for detailed context on specific topics:

| Skill | When to use |
|-------|-------------|
| [codebase](.github/skills/codebase/SKILL.md) | Build system, CLI, isobuild, tools/ directory |
| [conventions](.github/skills/conventions/SKILL.md) | Writing packages, CLI commands, code patterns |
| [testing](.github/skills/testing/SKILL.md) | Writing tests, debugging failures, test infrastructure |
| [packages](.github/skills/packages/SKILL.md) | Finding packages by feature, understanding dependencies |
| [modern-tools](.github/skills/modern-tools/SKILL.md) | tools-core utilities, rspack, modern integrations |
| [e2e-coverage](.github/skills/e2e-coverage/SKILL.md) | Updating the E2E test coverage report when apps/skeletons change |
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
done
```

This symlinks `.github/skills/` into `.claude/skills/` where Claude Code discovers them. The `.claude/skills/` directory is gitignored — each contributor must run this once per checkout.
