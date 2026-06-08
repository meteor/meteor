# MeteorJS Governance

This document describes how the Meteor project is organized, how decisions are made, and how contributors can grow into Core Committers. It works alongside [CONTRIBUTING.md](https://github.com/meteor/meteor/blob/devel/CONTRIBUTING.md), which covers the day-to-day contribution process.

## Why this document exists

Meteor has always depended on its community. But as the project grows, informal processes don't scale. This document makes the path from Contributor to Core Committer explicit, public, and achievable.

## Areas of Specialization

Each contributor will have one or more areas of specialization. This ensures that the development, code reviews, and maintenance of the Meteor ecosystem are guided by focused expertise. Specialized areas include domains such as Accounts, DDP, MongoDB, Reactivity, and the Build System, among others. Core Committers and TSC members are recognized for their specific domains of expertise.

## Tiers

### 1. Contributor

Anyone who opens pull requests, reviews issues, helps in the forum, writes docs, or participates in community discussions. No formal process required. This is where every Core Committer started.

### 2. Community Package Maintainer

Developers who maintain community packages that are relevant to the Meteor ecosystem. They're not part of the core repo, but their work directly shapes how developers experience Meteor. Recognized contributors at this level are listed in the [CONTRIBUTING.md](https://github.com/meteor/meteor/blob/devel/CONTRIBUTING.md) file.

### 3. Core Committer

The active front line of Meteor development. Core Committers have direct repo access and triage permissions within their domain — they can label, assign, and manage issues and PRs, and shepherd contributions toward merge. They're invited to alignment meetings and trusted with early visibility into the roadmap.

This is the most prestigious role in the Meteor community. It carries real responsibility and real autonomy.

**How to become a Core Committer:**

1. Anyone can open a pull request nominating a person for the Core Committer program. There's no minimum tenure or fixed contribution period — the nomination stands on the person's work and on community support.
2. The nomination is public and open to community input on the GitHub repository.
3. The community — and in particular the other Core Committers — is who approves or rejects the nomination.
4. Once approved, the nomination is documented at [docs.meteor.com/community/contributors.html](https://docs.meteor.com/community/contributors.html).

New packages entering the core start under an **experimental flag**. This gives the committer standing in front of it time to iterate, gather feedback, and prove stability before the package becomes official. The experimental stage has no fixed deadline, but the expectation is that packages move toward stable with clear milestones.

**Responsibilities:**

- Stand in front of at least one front of your choosing — a roadmap item, or another package/area/repository of the Meteor organization (e.g. the `performance` repo or Blaze). This is voluntary: you pick the front, and you're free to work on other things too.
- Review and triage PRs within their domain.
- Keep their area maintained and documented.
- Uphold the [Meteor Code of Conduct](https://github.com/meteor/meteor/blob/devel/CODE_OF_CONDUCT.md).

## Bennefits and trade-off

One thing worth calling out explicitly: with this document, **Core Committers gain more weight in shaping the project**, and in return take on one light commitment — standing in front of at least one front of their choosing.

On the influence side, Core Committers will have a stronger voice in:

- **Roadmap discussions** — what we prioritize, what we defer, what we cut. Core Committers are the people closest to the code and to users; their input should weigh more than a drive-by opinion.
- **Future governance evolutions** — changes to this document, new tiers, new areas, adjustments to the nomination process. The people who carry the project should be the people deciding how it's run.

On the accountability side, the expectation is lighter than it might sound: **Core Committers are not required to align their contributions with the roadmap**. You're free to work on what you find most valuable. What we do ask is that every Core Committer stands in front of **at least one front**. This doesn't mean you can only work on that front — it means you give it special attention as the area you chose to stand in front of. Signing up for a front is **voluntary**: each Core Committer chooses where to put their name, and no one is forced to attach their name to any specific front. The front can be a roadmap item or another area of the Meteor organization — for example the `performance` repository, Blaze, or any of the other projects under the Meteor umbrella.

This is the trade we're proposing: more say in the direction, and a light commitment to give special attention to at least one front you choose.

> **Important:** being a Core Committer is **not an employment relationship** with the Meteor brand, Meteor Software, or any company in the ecosystem. Core Committers are independent open-source contributors who are recognized for their work and trusted with triage rights in their domain. There is no contract, no compensation, and no employer/employee tie implied by the role. The expectations described here are community expectations, not labor obligations.

### 4. Technical Steering Committee (TSC)

The TSC is the governing body responsible for major, long-term decisions about the Meteor project. This includes architectural direction, breaking changes, project-wide policies, and anything that significantly affects the ecosystem.

The TSC is **not open to community nominations**. Unlike the Core Committer program, you cannot be nominated into the TSC by a pull request. The TSC is composed of Meteor Software employees, who hold organizational accountability for the project and its long-term stewardship.

**Access and permissions:**

- Access to private repositories within the Meteor organization.
- Permission to publish official Meteor releases.

**Responsibilities:**

- Set and maintain the long-term technical roadmap.
- Make final decisions on major architectural changes, breaking changes, and new core features when consensus among Core Committers cannot be reached.
- Approve changes to this governance document.
- Represent the Meteor project in the broader open-source ecosystem.

### 5. Alumni

Core Committers who are no longer actively contributing move to Alumni status. This happens automatically after 12 months of inactivity. No vote, no drama, just an honest reflection of where things are.

Alumni keep their recognition. They're listed on the Meteor website with their contribution history, and they can still review PRs and share opinions. They just no longer hold active triage permissions or voting rights.

If an Alumnus wants to return as an active Core Committer, the same nomination process applies.

## Current TSC Members

| Name | Role |
|------|------|
| @fredmaiaarantes | Meteor Software |
| @henriquealbert | Meteor Software |
| @Grubba27 | Meteor Software |
| @italojs | Meteor Software |
| @nachocodoner | Meteor Software |
| @aquinoit | Meteor Software |

## Current Core Committers

| Name | Area |
|------|------|
|TBD|TBD|


## Alumni

These are people who shaped Meteor and earned permanent recognition for their work. Alumni are listed publicly on the Meteor website with their contribution history.

Currently no members.

## Decision-making

Day-to-day decisions within a front belong to the Core Committer standing in front of it. Larger decisions that affect Meteor core, including breaking changes, new experimental packages, and changes to this document, require consensus among active Core Committers.

If consensus can't be reached, the TSC acts as the tiebreaker.

## Removing a Core Committer

A Core Committer can be removed by a two-thirds majority vote among active Core Committers for a serious violation of the Code of Conduct. This has never happened. The process exists to make expectations clear, not because we expect to use it.

## Changing this document

Anyone can propose changes to this document via a pull request. Changes require consensus among active Core Committers and approval from the TSC before merging.


