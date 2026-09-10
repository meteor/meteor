# MeteorJS Governance

This document explains how the Meteor project is organized, who does what, and how decisions get made. It goes together with [CONTRIBUTING.md](https://github.com/meteor/meteor/blob/devel/CONTRIBUTING.md), which covers the day-to-day of contributing.

## Why this document exists

Meteor has always run on its community. As the project grows, doing things informally stops working. This document writes down the roles and the path from Contributor to Core Maintainer so it's clear and open to everyone.

## Meteor Software's role

Meteor is owned and led by [Meteor Software](https://www.meteor.com/), with meaningful community participation — it is not an independent, foundation-run project. Spelling that out avoids confusion later:

- The TSC is composed of Meteor Software employees and acts on behalf of the company. Meteor Software holds final authority over the project, exercised through the TSC.
- Official releases, the long-term roadmap, and this governance model stay under Meteor Software's control.
- The community decides day-to-day matters on its own: triage, reviews, priorities within a front, and recommendations on core changes (see [Decision-making](#decision-making)).
- When company and community priorities differ, the TSC makes the call and normally documents the reasoning publicly.

## Roles

### Contributor

Anyone who opens pull requests, comments on issues, helps in the forum, writes docs, or joins a discussion. There's no process to become a Contributor — you just start. Every Core Maintainer began here.

### Community Package Maintainer

People who maintain community packages that matter to the Meteor ecosystem. They don't work in the core repo, but their packages shape how developers use Meteor every day. They're listed on the [contributors page](https://docs.meteor.com/community/contributors.html).

### Core Maintainer

Core Maintainers are trusted community members who help keep Meteor moving. They review pull requests and triage issues — labeling, assigning, and helping move contributions toward merge. They don't merge or publish releases themselves; that stays with the TSC.

**What Core Maintainers get a say in**

Core Maintainers are close to the code and to users, so their voice carries weight:

- They help shape the roadmap for the coming years — what to prioritize, what to postpone, what to drop.
- They can be brought into private discussions before a decision is opened to the wider community.
- They have a say in how this document and the project's processes change over time.

**What we ask in return**

Core Maintainers are **not** required to work on the roadmap. You work on what you think matters most. We only ask one thing: pick at least one **front** and give it attention. A front can be a roadmap item, a package, or another repo under the Meteor organization (for example `performance` or Blaze).

Picking a front is voluntary — you choose where to put your name, and no one is forced onto anything. It doesn't mean you can only work on that; you can take breaks and work on other things too. It just means the community knows this is something you're looking after.

**Responsibilities**

- Review and triage pull requests and issues.
- Give attention to at least one front of your choosing.
- Follow the [Meteor Code of Conduct](https://github.com/meteor/meteor/blob/devel/CODE_OF_CONDUCT.md).

> Being a Core Maintainer is **not a job**. There's no contract, no pay, and no employer relationship with Meteor Software or anyone else. Core Maintainers are independent open-source contributors who are trusted with triage rights. Everything here is a community expectation, not a work obligation.

### Technical Steering Committee (TSC)

The TSC makes the big, long-term calls: architectural direction, breaking changes, and project-wide policies.

The TSC is made up of Meteor Software employees, who are accountable for the project long-term. You **cannot** be nominated into the TSC by a pull request.

What the TSC can do:

- Access private repositories in the Meteor organization.
- Publish official Meteor releases. This stays the exclusive domain of Meteor Software.

What the TSC is responsible for:

- Setting and keeping the long-term roadmap.
- Making the final call on major changes, informed by the Core Maintainers' recommendation.
- Approving changes to this document.
- Representing Meteor in the wider open-source world.

### Alumni

Core Maintainers who stop contributing move to Alumni after 12 months of inactivity. It's automatic — no vote, no drama. Reviewing PRs and joining discussions still counts as contributing, so this is only for people who've truly stepped away.

Put simply: a Core Maintainer is **active** until they move to Alumni. Wherever this document says "active Core Maintainers", it means everyone currently listed as a Core Maintainer who hasn't moved to Alumni.

Alumni keep their recognition and stay listed on the Meteor website. They can still review PRs and share opinions. They just don't hold triage rights or a vote anymore. If an Alumnus wants to come back, they go through the same nomination as anyone else.

## How to become a Core Maintainer

1. Anyone can open a pull request nominating someone for the Core Maintainer program — self-nominations included. There's no minimum time or set number of contributions — the nomination stands on the person's work and on community support.
2. The nomination is public, on the GitHub repository, and stays open for at least 14 days so existing Core Maintainers and the wider community can give feedback.
3. It needs explicit support from at least two active Core Maintainers or TSC members.
4. The TSC approves and merges the nomination. Permissions are only granted after that approval.
5. Once accepted, it's recorded at [docs.meteor.com/community/contributors.html](https://docs.meteor.com/community/contributors.html).

New packages entering core start behind an **experimental flag**. This gives the person looking after it time to iterate and prove it's stable before it becomes official. There's no fixed deadline, but the goal is to move toward stable.

## Who holds these roles

The canonical list of current TSC members, Core Maintainers, Community Package Maintainers, and Alumni lives on the [contributors page](https://docs.meteor.com/community/contributors.html). This document defines the roles and their authority; that page records who holds them. Membership changes are made by pull request against that page, following the processes described here.

## Decision-making

Who decides depends on how big the change is:

- **Small change in one front** — the Core Maintainer looking after that front decides. For example: which PRs to move forward, or which issues come first.
- **Change to Meteor core** — for example a breaking change, a new experimental package, or a change to this document. The active Core Maintainers deliberate and make a recommendation; the TSC makes the final call. When the TSC decides against the recommendation, it normally documents the reasoning publicly.

Two things are always the TSC's call: the long-term roadmap and publishing official releases.

**Votes.** When this document calls for a vote of the active Core Maintainers, the vote stays open for at least seven days, and thresholds (like the two-thirds removal vote) are counted over the votes cast — abstentions and non-responses don't count toward either side. Anyone directly involved in the matter being voted on recuses themselves.

**Roadmap input.** The roadmap is the TSC's call, but active Core Maintainers have a defined advisory role in it: the TSC and the active Core Maintainers hold a regular roadmap discussion before major updates go public, and a short summary of that discussion is published. People who triage issues and talk to users every week see things a high-level roadmap misses — this is where that input lands, instead of scattered comments and DMs.

## Communication channels

GitHub is the durable record: issues, pull requests and discussions are where decisions live. The [community Discord](https://discord.gg/hZkTCaVjmT) is where coordination happens:

- **Public channels** for contributor and maintainer coordination — asking "is anyone already on this?", "does this fit what's planned?", "who knows this part?", "does anyone have time to review it soon?".
- **A private channel** for active Core Maintainers and the TSC — moderation and Code of Conduct situations, security issues, possibly compromised accounts, release coordination, and checking who actually has capacity.

Private is for coordination, capacity, and genuinely sensitive things — not the place where normal technical decisions quietly disappear. When a private discussion produces a technical, roadmap, or governance decision, the result and the reasoning come back to GitHub, unless there's a real security, privacy, or moderation reason not to.
## Suspending or removing a Core Maintainer

**Suspension.** The TSC can suspend a Core Maintainer's permissions immediately when trust can no longer safely be assumed — for example a compromised account or a credible security concern. A suspension is followed by a documented review with the person involved; it either lifts the suspension or starts the removal process. Suspension is a safety measure, not a punishment.

**Removal.** A Core Maintainer can be removed by a two-thirds vote of the active Core Maintainers, for a serious Code of Conduct violation. This has never happened. The rule exists to be clear about expectations, not because we expect to use it.

## Changing this document

Anyone can propose changes with a pull request. Changes need agreement among active Core Maintainers and approval from the TSC before merging.
