Meteor Roadmap
==============

This document describes the high level features the project has decided to prioritize in the near to medium term future. A large fraction of the MDG core engineering team's time will be dedicated to working on the features described here.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap as maintainers will prioritize their time around these contributions. This however does not mean that PR's against other features and bugs will be automatically rejected.

For the meantime, MDG won't be accepting PR's for changes to the roadmap. We hope to change this in the future as we figure out strategies to decentralize Meteor development.

# MongoDB updates

The mongo driver that currently ships with Meteor is quite old and users are finding issues with connecting to MongoDB 3.2 databases (e.g [#6258](https://github.com/meteor/meteor/issues/6258)). We want to update to the latest driver [#5763](https://github.com/meteor/meteor/issues/5763).

In addition, we'd like to update the dev bundle to ship with the latest stable version of MongoDB (3.2) [#5809](https://github.com/meteor/meteor/issues/5809) as MongoDB 2.6 will be officially sunsetted at the end of October, 2016.

# Support for Node 4 and beyond

We want to be able to update the version of Node that ships with Meteor to 4 and eventually 6 when it is released [#5124](https://github.com/meteor/meteor/issues/5124). [#6537](https://github.com/meteor/meteor/issues/6537) lays the groundwork to overcome the main blocker for updating to Node 4, that is, needing to rebuild all existing Meteor packages that contain binary dependencies.

# Full transition to npm

1.3 introduced `npm install` support along with ES2015 modules. With 1.4, we would like to transition the Meteor package ecosystem over entirely from Atmosphere to npm. We are still in the early conceptual design phase and expect to update the roadmap once we have a design in place that will underpin further development. 

# Data

We're building the next generation data stack for modern applications called [Apollo](https://github.com/apollostack/apollo). We believe the data part of the Meteor stack is impactful enough to deserve it's own fully fledged sub-project that will be compatible with other languages and frameworks. Apollo is born from the Meteor project and is naturally designed to work perfectly with Meteor.

# View Layer

Our plans around the view layer are to maintain strong integrations (along with guidance) with React, Angular and Blaze. We'll make essential fixes to Blaze but most likely won't be adding new features ourselves. We encourage you to help build the features you need at the [meteor/blaze](https://github.com/meteor/blaze) repository.
