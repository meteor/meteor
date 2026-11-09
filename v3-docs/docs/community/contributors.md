---
outline: false
---

<script setup>
import { data as contributors } from './contributors.data'

const technicalCommittee = [
  { login: 'italojs', avatar_url: 'https://github.com/italojs.png', html_url: 'https://github.com/italojs', contributions: 0 },
  { login: 'Grubba27', avatar_url: 'https://github.com/Grubba27.png', html_url: 'https://github.com/Grubba27', contributions: 0 },
  { login: 'nachocodoner', avatar_url: 'https://github.com/nachocodoner.png', html_url: 'https://github.com/nachocodoner', contributions: 0 },
  { login: 'henriquealbert', avatar_url: 'https://github.com/henriquealbert.png', html_url: 'https://github.com/henriquealbert', contributions: 0 },
  { login: 'aquinoit', avatar_url: 'https://github.com/aquinoit.png', html_url: 'https://github.com/aquinoit', contributions: 0 },
  { login: 'MarlomSouza', avatar_url: 'https://github.com/MarlomSouza.png', html_url: 'https://github.com/MarlomSouza', contributions: 0 },
  { login: 'geekforbrains', avatar_url: 'https://github.com/geekforbrains.png', html_url: 'https://github.com/geekforbrains', contributions: 0 },
]

const coreMaintainers = [
  { login: 'radekmie', avatar_url: 'https://github.com/radekmie.png', html_url: 'https://github.com/radekmie', contributions: 0 },
  { login: 'StorytellerCZ', avatar_url: 'https://github.com/StorytellerCZ.png', html_url: 'https://github.com/StorytellerCZ', contributions: 0 },
  { login: 'zodern', avatar_url: 'https://github.com/zodern.png', html_url: 'https://github.com/zodern', contributions: 0 },
  { login: 'fredmaiaarantes', avatar_url: 'https://github.com/fredmaiaarantes.png', html_url: 'https://github.com/fredmaiaarantes', contributions: 0 },
  { login: 'jankapunkt', avatar_url: 'https://github.com/jankapunkt.png', html_url: 'https://github.com/jankapunkt', contributions: 0 },
  { login: 'harryadel', avatar_url: 'https://github.com/harryadel.png', html_url: 'https://github.com/harryadel', contributions: 0 },
  { login: 'dupontbertrand', avatar_url: 'https://github.com/dupontbertrand.png', html_url: 'https://github.com/dupontbertrand', contributions: 0 },
  { login: 'mvogttech', avatar_url: 'https://github.com/mvogttech.png', html_url: 'https://github.com/mvogttech', contributions: 0 },
  { login: 'sanki92', avatar_url: 'https://github.com/sanki92.png', html_url: 'https://github.com/sanki92', contributions: 0 },
  { login: 'vparpoil', avatar_url: 'https://github.com/vparpoil.png', html_url: 'https://github.com/vparpoil', contributions: 0 },
  { login: 'vlasky', avatar_url: 'https://github.com/vlasky.png', html_url: 'https://github.com/vlasky', contributions: 0 },
  { login: '9Morello', avatar_url: 'https://github.com/9Morello.png', html_url: 'https://github.com/9Morello', contributions: 0 },
  { login: 'minhna', avatar_url: 'https://github.com/minhna.png', html_url: 'https://github.com/minhna', contributions: 0 },
]
</script>

# Contributors

This page is the canonical record of who holds each role in the Meteor project. The roles themselves are defined in [GOVERNANCE.md](https://github.com/meteor/meteor/blob/devel/GOVERNANCE.md).

## Technical Steering Committee (TSC)

The Technical Steering Committee (TSC) is responsible for the direction and governance of the Meteor project.

<Contributors :contributors="technicalCommittee" :show-contributions="false" />

## Core Maintainers

Core Maintainers are experienced contributors who actively maintain key areas of the Meteor codebase.

<Contributors :contributors="coreMaintainers" :show-contributions="false" />

## Community Package Maintainers

Community Package Maintainers look after community packages that matter to the Meteor ecosystem. See [GOVERNANCE.md](https://github.com/meteor/meteor/blob/devel/GOVERNANCE.md#community-package-maintainer) for the role description.

No members are listed yet — additions are made by pull request against this page.

## Alumni

Former Core Maintainers who earned lasting recognition for their contributions. See [GOVERNANCE.md](https://github.com/meteor/meteor/blob/devel/GOVERNANCE.md#alumni) for how the Alumni status works.

Currently no members.

## All Contributors

Thank you to all the amazing people who have contributed to Meteor! This list is automatically generated from the [meteor/meteor](https://github.com/meteor/meteor) GitHub repository, sorted by number of commits.

<Contributors :contributors="contributors" />
