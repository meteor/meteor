---
name: release-roadmap
description: Update the Meteor roadmap and the README’s upcoming release table when priorities change, a patch is planned, or a release ships.
---

# Maintain the release roadmap

Keep goals and release targets in the [roadmap](../../../v3-docs/docs/about/roadmap.md). Edit the contributor tables once, in the [README](../../../README.md) region named `release-collaboration`. When replacing the roadmap, carry over its VitePress include and its link to the README for GitHub readers.

## Reconcile the release plan

| When | What to update |
| --- | --- |
| Priorities change | Update the affected projects, targets, and roadmap date. Match the table’s timing and focus to the agreed plan. Link the actual open milestone, or use a target badge pointing to the roadmap section until a milestone exists. |
| A patch is planned | Add or update its release row. Read the milestone’s issues and PRs alongside the agreed patch scope, then select badges as described below. |
| A release ships | Confirm what shipped against the published release notes. Retire its upcoming row, record the delivered work, and adjust the timing of other active rows as needed. Keep deferred work visible with its agreed target or leave its timing open. |

Look up milestones and labels in `meteor/meteor`. If a PR still carries an old milestone, use the maintainers’ confirmed target and flag the discrepancy.

## Choose patch badges

- **Release focus** links to live labels for the planned work. Check the report or fix itself when labels are incomplete. Security work uses `type: security`. See the [label guide](https://github.com/meteor/meteor/blob/devel/LABELS.md).
- **Bugs in minor-release areas** finds possible regressions across milestones. For patch `X.Y.Z`, map the main changes in [the parent minor’s changelog](../../../v3-docs/docs/generators/changelog/versions/) (`X.Y.0.md`) to current areas. For example, native TypeScript declarations suggest the search `is:open label:"type: bug" label:"area: types"`. Leave this column empty for upcoming minors.

## Check the result

Preserve the column order and badge style. Keep search definitions inside the shared region. If the target heading moves, update both `roadmap-priorities` definitions using a file path and fragment in the README and a local fragment in VitePress.

Check that both pages agree on versions and scope. Open changed badges to verify their milestones or search filters. Run `npm run docs:build` from `v3-docs/docs` and inspect the rows and links in `.vitepress/dist/about/roadmap.html`.
