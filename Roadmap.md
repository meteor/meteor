# Meteor Roadmap

**Up to date as of Jan 20, 2021**

This document describes the high-level features and actions for the Meteor project in the near- to medium-term future. This roadmap was built based on community feedback and to improve areas where Meteor is already strong. The description of many items include sentences and ideas from Meteor community members.

As with any roadmap, this is a living document that will evolve as priorities and dependencies shift; we aim to update the roadmap with any changes or status updates every quarter.

Contributors are encouraged to focus their efforts on work that aligns with the roadmap then we can work together in these areas.

PRs to the roadmap are welcome. If you are willing to contribute please open a PR explaining your ideas and what you would be able to do yourself.

## Priorities for V2

Updated at: 2021/01/20

V2 initial release (2.0) was delivered today (2021/01/20) with Hot Module Replacement (HMR), React Fast Refresh, and Free deploy including MongoDB on [Cloud](https://www.meteor.com/cloud) and some other features. See all the changes [here](./History.md). 

We expect to have HMR also working for Blaze in Meteor 2.1 in the following weeks (it's currently on [beta](https://github.com/meteor/blaze/pull/313)).

Other important updates that you should expect to see in Meteor 2.2, 2.3 and so on:
- Node.js 14; [PR](https://github.com/meteor/meteor/pull/11197)
- Cordova 10; [PR](https://github.com/meteor/meteor/pull/11208)
- Remove deprecated code pre v1; [PR](https://github.com/meteor/meteor/pull/11226)
- Tree-shaking; [PR](https://github.com/meteor/meteor/pull/11164)
- Blaze HMR; [PR](https://github.com/meteor/blaze/pull/313)
- Tutorials migration (help needed, understand [here](https://forums.meteor.com/t/new-meteor-react-tutorial-and-new-format-for-tutorials/54074));

Do you want to get involved in the items above? Talk to [Filipe Névola](https://twitter.com/filipenevola) in the [community Slack](https://join.slack.com/t/meteor-community/shared_invite/enQtODA0NTU2Nzk5MTA3LWY5NGMxMWRjZDgzYWMyMTEyYTQ3MTcwZmU2YjM5MTY3MjJkZjQ0NWRjOGZlYmIxZjFlYTA5Mjg4OTk3ODRiOTc)

V2 minor releases are not limited by the items above, these are the ones already in progress, some of them are going to be ready in the next weeks.

## Priorities for V3

Updated at: 2021/01/20

Meteor is accelerating! We are going release more often this year.

We expect to have new features focusing in ease app development in V3 or probably in V2 as well, the first step is to review our [feature requests](https://github.com/meteor/meteor-feature-requests) one more time and define new priorities.

Maybe we should also have a new way of prioritization for new features, right now this [repository]((https://github.com/meteor/meteor-feature-requests)) with issues is not good enough in our opinion, the plan is to be even more open for feedbacks and collaboration. If we make changes in this process we are going to announce in the [Forums](https://forums.meteor.com/) and Slack as always.

> We are also looking for new developers to be part of our core team and of course if you are already contributing to Meteor you have a head start.
> 
> We don't have an official position description yet but again, contributing to Meteor in the open-source is the best way to join the core team.

Maybe you are asking: Why the format of this Roadmap was changed in this update?

We believe the items here were in some part outdated so we want to have a "fresh start". You should expect a new list of items here soon. It doesn't mean that all the old items are out of question, or they aren't important, probably the opposite and you will see most of them again here soon.

## Recently completed

### MongoDB shared hosting on Cloud
- Leaders: Meteor Software
- Status: shipped in January 2021

You can host your app on Galaxy and use our shared MongoDB for non-commercial/non-production apps. We don't recommend a shared MongoDB instance for production apps.

### Free deploy on Cloud
- Leaders: Meteor Software
- Status: shipped in January 2021

Meteor free deploy is back.

### Hot Module Replacement
- Leaders: [zodern](https://github.com/zodern)
- Status: shipped in January 2021
- PRs: https://github.com/meteor/meteor/pull/11117

HMR is available since Meteor 2.0

### Vue.js
- Leaders: [Brian Mulhall](https://github.com/BrianMulhall)
- Status: shipped in August 2020
- PRs: https://github.com/meteor/simple-todos-vue

Tutorial is ready and create command meteor create --vue

### Apollo
- Leaders: [Jan Dvorak](https://github.com/StorytellerCZ)
- Status: shipped in August 2020
- PRs: https://github.com/meteor/meteor/pull/11119

Apollo skeleton, meteor create --apollo

### Performance improvements on Windows
- Leaders: [zodern](https://github.com/zodern)
- Status: shipped in August 2020
- PRs: https://github.com/meteor/meteor/pull/10838 https://github.com/meteor/meteor/pull/11114 https://github.com/meteor/meteor/pull/11115 https://github.com/meteor/meteor/pull/11102

Explore ideas to improve performance on Windows such as build in place.

### Update React Tutorial
- Leaders: [Leonardo Venturini](https://github.com/leonardoventurini) / [Brian Mulhall](https://github.com/BrianMulhall)
- Status: shipped in July 2020
- PRs: https://github.com/meteor/simple-todos-react

### React Native
- Leaders: [Nathaniel Dsouza](https://github.com/TheRealNate)
- Status: shipped in June 2020
- PRs: https://github.com/meteor/guide/pull/1041 https://github.com/meteor/guide/pull/1039 https://github.com/meteor/guide/pull/1035

Guide is ready ([check here](https://guide.meteor.com/react-native.html)).

### Update Blaze Tutorial
- Leaders: [Jan Küster](https://github.com/jankapunkt), [Harry Adel](https://github.com/harryadelb), [Brian Mulhall](https://github.com/BrianMulhall)
- Status: shipped in April 2020
- PRs: https://github.com/meteor/tutorials/pull/200 https://github.com/meteor/tutorials/pull/199

Blaze tutorial should reflect latest best practices.

### Update MongoDB driver
- Leaders: [Christian Klaussner](https://github.com/klaussner)
- Status: shipped in Meteor 1.10.1
- PRs: https://github.com/meteor/meteor/pull/10861 / https://github.com/meteor/meteor/pull/10723

Update to Mongodb driver from 3.2.7 to 3.5.4, this version is compatible with MongoDB 4.2.

### Update Cordova to 9
- Leaders: [Filipe Névola](https://github.com/filipenevola) / [Renan Castro](https://github.com/renanccastro)
- Status: shipped in Meteor 1.10.1
- PRs: https://github.com/meteor/meteor/pull/10861 / https://github.com/meteor/meteor/pull/10810 / https://github.com/meteor/meteor/pull/10861

Update Cordoba lib and its dependencies to latest (version 9)

### Update to Node.js 12
- Leaders: [Ben Newman](https://github.com/benjamn)
- Status: shipped in Meteor 1.9.
- PRs: https://github.com/meteor/meteor/pull/10527

Since Node.js 12 is scheduled to become the LTS version on October 1st, 2019, Meteor 1.9 will update the Node.js version used by Meteor from 8.16.1 (in Meteor 1.8.2) to 12.10.0 (the most recent current version).

### Different JS bundles for modern versus legacy browsers

- Status: shipped in Meteor 1.6.2.
- PRs: https://github.com/meteor/meteor/pull/9439

### Eliminate the need for an `imports` directory

- Status: shipped in Meteor 1.6.2.
- PRs: https://github.com/meteor/meteor/pull/9690, https://github.com/meteor/meteor/pull/9714, https://github.com/meteor/meteor/pull/9715

### Make Mongo more optional

- Status: shipped in Meteor 1.6.2.
- PRs: https://github.com/meteor/meteor/pull/8999

### Upgrade to Node 8

- Status: shipped in Meteor 1.6.
- PRs: https://github.com/meteor/meteor/pull/8728

### Upgrade to npm 5

- Status: shipped in Meteor 1.6

### Dynamic `import(...)`

- Status: shipped in Meteor 1.5

### Rebuild performance improvements

- Status: shipped in Meteor 1.4.2

### MongoDB updates

- Status: shipped in Meteor 1.4

### Support for Node 4 and beyond

- Status: shipped in Meteor 1.4

### View Layer

- Status: Blaze split into new repository and can be published independently as of 1.4.2

### Other

For more completed items, refer to the project history here: https://github.com/meteor/meteor/blob/devel/History.md
