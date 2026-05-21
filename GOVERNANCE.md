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

The active front line of Meteor development. Core Committers have direct repo access and merge permissions within their domain. They're included in the private `#core-committers` Slack channel, invited to alignment meetings, and trusted with early visibility into the roadmap.

This is the most prestigious role in the Meteor community. It carries real responsibility and real autonomy.

**How to become a Core Committer:**

1. Contribute consistently and with quality for at least 3 to 6 months. This includes code, reviews, or meaningful community involvement.
2. Any existing Core Committer can nominate you. Nominations are made publicly in the GitHub repository.
3. A simple majority vote among active Core Committers confirms the nomination.
4. New Core Committers are typically assigned ownership of a specific package or area as their first concrete responsibility.

New packages entering the core start under an **experimental flag**. This gives the assigned committer time to iterate, gather feedback, and prove stability before the package becomes official. The experimental stage has no fixed deadline, but the expectation is that packages move toward stable with clear milestones.

**Responsibilities:**

- Review and merge PRs within their domain.
- Keep their area maintained and documented.
- Participate in the `#core-committers` Slack channel and attend alignment meetings when possible.
- Uphold the [Meteor Code of Conduct](https://github.com/meteor/meteor/blob/devel/CODE_OF_CONDUCT.md).

## Bennefits and trade-off

One thing worth calling out explicitly: with this document, **Core Committers gain more weight in shaping the project**, and in return are held to a higher bar on where they put their effort.

On the influence side, Core Committers will have a stronger voice in:

- **Roadmap discussions** — what we prioritize, what we defer, what we cut. Core Committers are the people closest to the code and to users; their input should weigh more than a drive-by opinion.
- **Future governance evolutions** — changes to this document, new tiers, new areas, adjustments to the nomination process. The people who carry the project should be the people deciding how it's run.

On the accountability side, the expectation tightens in one specific way: **Core Committer contributions are expected to align with the roadmap and/or internally defined objectives**. Side experiments and personal explorations are always welcome as a Contributor, but once you hold merge rights in a domain, the work you push forward should connect to what the project has committed to. The point isn't to suppress initiative — it's to make sure that the people with the most leverage are using it on the things that move Meteor as a whole.

This is the trade we're proposing: more say in the direction, more responsibility for staying on it.

> **Important:** being a Core Committer is **not an employment relationship** with the Meteor brand, Meteor Software, or any company in the ecosystem. Core Committers are independent open-source contributors who are recognized for their work and trusted with merge rights in their domain. There is no contract, no compensation, and no employer/employee tie implied by the role. The expectations described here are community expectations, not labor obligations.

### 4. Technical Steering Committee (TSC)

The TSC is the governing body responsible for major, long-term decisions about the Meteor project. This includes architectural direction, breaking changes, project-wide policies, and anything that significantly affects the ecosystem.

TSC members are drawn from active Core Committers who hold organizational accountability for the project. Membership is not open to nomination in the same way as Core Committers — it reflects both technical leadership and long-term stewardship of the project.

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

Alumni keep their recognition. They're listed on the Meteor website with their contribution history, and they can still review PRs and share opinions. They just no longer hold active merge permissions or voting rights.

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
| @fredmaiaarantes | Meteor Software |
| @henriquealbert | Meteor Software |
| @Grubba27 | Meteor Software |
| @italojs | Meteor Software |
| @nachocodoner | Meteor Software |
| @aquinoit | Meteor Software |

## Alumni

These are people who shaped Meteor and earned permanent recognition for their work. Alumni are listed publicly on the Meteor website with their contribution history.

Currently no members.

## Decision-making

Day-to-day decisions within a domain belong to the Core Maintainer responsible for it. Larger decisions that affect Meteor core, including breaking changes, new experimental packages, and changes to this document, require consensus among active Core Maintainers.

If consensus can't be reached, the Meteor team (Galaxy) acts as the tiebreaker.

## Removing a Core Maintainer

A Core Maintainer can be removed by a two-thirds majority vote among active Core Maintainers for a serious violation of the Code of Conduct. This has never happened. The process exists to make expectations clear, not because we expect to use it.

## Changing this document

Any Core Maintainer can propose changes to this document via a pull request. Changes require consensus from active Core Maintainers before merging.


