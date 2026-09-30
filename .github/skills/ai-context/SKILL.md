---
name: ai-context
description: Use when creating, updating, or maintaining AI documentation files (AGENTS.md, CLAUDE.md, skills). Covers file structure, conventions, and guidelines for evolving AI context.
---

# AI Context Documentation

How to write and maintain the structured documentation that AI coding assistants consume.

## File Hierarchy

```
AGENTS.md                            # Root context — always loaded by agents
CLAUDE.md                            # Required for Claude Code (loads AGENTS.md)
.github/skills/<topic>/SKILL.md      # On-demand detailed context
packages/<name>/AGENTS.md            # Package-specific context
<any-folder>/AGENTS.md               # Folder-specific context
```

## Root Files

### AGENTS.md

Always loaded on every interaction. Keep it **minimal** to save tokens.

Must contain:
- One-line project description
- Essential commands (run, test, build)
- Repository structure overview (top-level dirs only)
- Skills index table linking to each `SKILL.md`
- Key entry points for common tasks

Must **not** contain:
- Detailed explanations (put those in skills)
- Code examples longer than one line
- Duplicated content from skills

### CLAUDE.md

Required because Claude Code doesn't load `AGENTS.md` natively. It bridges Claude Code into the same context system. Contents:

```markdown
Read [AGENTS.md](AGENTS.md) before starting any task.

## Skills

Load these for detailed context on specific topics:

| Skill | When to use |
|-------|-------------|
| [<name>](.github/skills/<name>/SKILL.md) | <description> |
```

Keep in sync with the skills table in `AGENTS.md`.

## Skills

### Creating a Skill

1. Create `.github/skills/<topic>/SKILL.md`
2. Add YAML frontmatter with `name` and `description`
3. Add an entry to the skills table in both `AGENTS.md` and `CLAUDE.md`

### SKILL.md Format

```markdown
---
name: <topic>
description: <when an agent should load this — be specific about triggers>
---

# <Title>

<One-line summary.>

## <Sections organized by task>
```

### Writing Guidelines

- **Frontmatter `description`**: Write it as a trigger — what task or question should cause an agent to load this skill
- **Be concise**: Use tables over prose, code snippets over explanations
- **Be specific**: File paths, command names, function signatures — not vague descriptions
- **No duplication**: If info exists in another skill, reference it instead of repeating
- **Actionable structure**: Organize by what the agent needs to *do*, not by architecture

## Package & Folder Context

Add `AGENTS.md` inside a package or folder when:
- The directory has non-obvious conventions agents keep getting wrong
- There are local commands, patterns, or gotchas not covered by root docs

Keep these files very short — a few lines of context is often enough.

## When to Update

| Trigger | Action |
|---------|--------|
| Agent repeatedly asks about a topic | Create a new skill |
| Agent gets something wrong despite docs | Refine the relevant skill |
| New package/directory with unique patterns | Add a local `AGENTS.md` |
| Architecture or tooling changes | Update affected skills |
| Skill grows too large | Split into multiple skills |
| Skills table changes | Update both `AGENTS.md` and `CLAUDE.md` |

## Principles

1. **Token budget**: Root files stay small; details go in skills
2. **Load on demand**: Skills are only read when relevant to the task
3. **Living docs**: Update when patterns change — stale docs are worse than none
4. **Cross-platform**: `AGENTS.md` + `.github/skills/` is the shared convention; `CLAUDE.md` bridges Claude Code which doesn't load `AGENTS.md` natively
