# Random
This package is based on Reaction Commerce's own version of [random](https://github.com/reactioncommerce/random).

A drop-in replacement for the [Meteor random package](https://docs.meteor.com/packages/random.html). Unlike the Meteor package, you can use this either with or without Meteor.

## Installation

```bash
npm i --save @meteorjs/random
```

## Usage

```js
import Random from "@meteorjs/random";

const id = Random.id();
```

## API

[See Meteor package documentation](https://docs.meteor.com/packages/random.html)

## Other similar packages

The [meteor-random](https://www.npmjs.com/package/meteor-random) NPM package ported Meteor's random package a few years back. This has the latest updates, modernized code, and tests.
