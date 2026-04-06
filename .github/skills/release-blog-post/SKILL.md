---
name: release-blog-post
description: Use for generating Meteor release blog posts based on PRs merged into the release branch. Defines required section structure, formatting conventions, PR-based generation workflow (with gh CLI), and writing guidelines for turning raw PRs into an engaging blog post.
---

# Meteor Release Blog Post Rules

Guidelines for authoring and generating Meteor release blog posts.

## Output Destination

Generate the blog post as a draft markdown file. By default, you can store it in `/tmp/blog-post-<VERSION>.md` or ask the user for the specific website repository location where blog posts are kept.

---

## Required Entry Structure

A release blog post is structured as an engaging article for the community, rather than a raw list of PRs.

### Frontmatter

```yaml
---
title: "Meteor <VERSION>"
date: <YYYY-MM-DD>
author: <Author Name>
---
```

### Introduction
* Announce the release and give a high-level summary of the biggest feature or theme of the release.

### Highlights (Subheaders)
Group the most impactful changes into distinct conceptual topics based on the PRs.
* **Topic 1 (e.g., Node.js Upgrade)**
  * A paragraph explaining the benefit to developers.
  * Specific details or small code snippets if relevant.
* **Topic 2 (e.g., Rspack Integration)**
  * A paragraph explaining why this matters.
  
### Other Important Changes
* **Topic 1 (e.g., bug fix)**
  * A paragraph explaining the benefit to developers.
  * Specific details or small code snippets if relevant.
* **Topic 2 (e.g., feature improvement)**
  * A paragraph explaining why this matters.
* **Topic 3 (e.g., dependency update)**
  * A paragraph explaining why this matters.

### Migration Guide
* Explain how to update:
  ```bash
  meteor update --release <VERSION>
  ```
* Include any specific steps necessary for breaking changes identified in the PRs.

### Special Thanks
* A section thanking community contributors who made PRs for this release.

---

## Formatting Rules

* Focus on readability and narrative, it's a blog post for the community. Translate raw changelog jargon into developer benefits.
* Use emojis strategically to make the post engaging (e.g., ⚡️, 🚀, 📦).
* Link PRs using `[#1234](https://github.com/meteor/meteor/pull/1234)` or user handles when helpful, but favor a readable sentence over lists of links.
* **Tone**: Enthusiastic, professional, clear.

## Writting rule
* Write a skeleton of the blog post with the structure defined above and ask if the user want to change sometihgn before continue.
* Aways iterate over ALL PRs merged into the release branch.
* For each PR ask how long and detailed the user wants the paragraphs should be.
* For each PR ask if the user have any extra content about that PR(some meteor forum links for example).

---

## Branching Model & Comparison Baseline

Like the changelog, release blog posts are based on **`release-<VERSION>`** branches (e.g., `release-3.4.1`). 

- **Scope** = all changes on `release-<VERSION>` that are not on `devel`
- **PR base** = PRs merged with base `release-<VERSION>`

---

## Generating a Blog Post from PRs

Use merged PRs targeting the release branch to build the narrative.

### Fetch PRs

**Primary — `gh` CLI:**

```bash
gh pr list --repo meteor/meteor \
  --base release-<VERSION> \
  --state merged \
  --limit 200 \
  --json number,title,labels,author,body,url
```

### Synthesis & Writing Process

1. **Analyze PRs**: Review all fetched PRs to identify the overarching themes.
2. **Prioritize**: Select the top 1-3 features to serve as the "Highlights", looking for PRs with labels like `Project:xxx`, `Type:Feature`, or large impact.
3. **Draft the Narrative**:
   - Write an introduction focusing on the top themes.
   - Flesh out the "Highlights" sections, explaining the *value* of the PRs rather than just summarizing the code diffs.
   - Summarize the remaining relevant PRs under "Other Important Changes".
4. **Extract Authors**: Collect author handles from the PRs (excluding core maintainers if desired, focusing on community). Populate the "Special Thanks" section.

### Breaking Change Detection

Ensure any breaking changes mentioned in PRs are prominently discussed in the "Highlights" or "Migration Guide", providing clear instructions for developers on how to adapt.

---

## Review Checklist

* Is the title engaging and clear?
* Are the biggest PR themes grouped logically instead of being listed randomly?
* Is the tone appropriate for a blog post?
* Are update commands and migration steps included?
* Are community contributors credited properly?
