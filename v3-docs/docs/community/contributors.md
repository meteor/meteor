---
outline: false
---

<script setup>
import { data as contributors } from './contributors.data'

const technicalCommittee = [
  { login: 'italojs', avatar_url: 'https://github.com/italojs.png', html_url: 'https://github.com/italojs', contributions: 0 },
  { login: 'Grubba27', avatar_url: 'https://github.com/Grubba27.png', html_url: 'https://github.com/Grubba27', contributions: 0 },
  { login: 'nachocodoner', avatar_url: 'https://github.com/nachocodoner.png', html_url: 'https://github.com/nachocodoner', contributions: 0 },
  { login: 'fredmaiaarantes', avatar_url: 'https://github.com/fredmaiaarantes.png', html_url: 'https://github.com/fredmaiaarantes', contributions: 0 },
  { login: 'henriquealbert', avatar_url: 'https://github.com/henriquealbert.png', html_url: 'https://github.com/henriquealbert', contributions: 0 },
  { login: 'aquinoit', avatar_url: 'https://github.com/aquinoit.png', html_url: 'https://github.com/aquinoit', contributions: 0 },
  { login: 'MarlomSouza', avatar_url: 'https://github.com/MarlomSouza.png', html_url: 'https://github.com/MarlomSouza', contributions: 0 },
]

const coreMaintainers = [
  { login: 'radekmie', avatar_url: 'https://github.com/radekmie.png', html_url: 'https://github.com/radekmie', contributions: 0 },
  { login: 'StorytellerCZ', avatar_url: 'https://github.com/StorytellerCZ.png', html_url: 'https://github.com/StorytellerCZ', contributions: 0 },
  { login: 'zodern', avatar_url: 'https://github.com/zodern.png', html_url: 'https://github.com/zodern', contributions: 0 },
]
</script>

# Contributors

## Technical Committee

The Technical Committee is responsible for the direction and governance of the Meteor project.

<Contributors :contributors="technicalCommittee" :show-contributions="false" />

## Core Maintainers

Core Maintainers are experienced contributors who actively maintain key areas of the Meteor codebase.

<Contributors :contributors="coreMaintainers" :show-contributions="false" />

## All Contributors

Thank you to all the amazing people who have contributed to Meteor! This list is automatically generated from the [meteor/meteor](https://github.com/meteor/meteor) GitHub repository, sorted by number of commits.

<Contributors :contributors="contributors" />
