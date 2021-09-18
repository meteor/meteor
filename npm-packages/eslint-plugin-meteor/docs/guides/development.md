# Setup Development Environment

This document describes how developers can contribute by adding rules for ESLint-plugin-Meteor. Before implementing a rule, create an issue to discuss the proposed rule. After getting some feedback, you can develop the rule. Every rule must have adequate tests and documentation. Reading the [ESLint developer guide](http://eslint.org/docs/developer-guide/) is a good start.

Run the following commands to set up ESLint-plugin-Meteor in development mode.

```bash
# clone repository
$ git clone git@github.com:dferber90/eslint-plugin-meteor.git

# install dependencies
$ npm install
```

## Development Setup

This plugin runs untranspiled. The source code needs to be compatible with node version 4 and upwards.

Run `npm run` to see the available scripts for tests, unit-tests and so on.

```bash
# run unit-tests only
$ npm run unit-test

# run linter only
$ npm run lint

# run unit-tests only
$ npm run unit-test

# run unit-tests in watch mode
$ npm run unit-test:watch

# run complete test suite
$ npm test
```

## Linking

npm can link packages. This makes version set up for development available in other projects. It enables testing new rules on real projects. To be able to link this package to another project, that one has to be [set up correctly first](/docs/guides/setup.md).

```bash
# Make this package available globally
# by running this command from the root of this package
$ npm link

# In a project using this plugin, install the linked version
$ npm link eslint-plugin-meteor
```

Read more about linking [here](https://docs.npmjs.com/cli/link).

## Creating rules

Creating rules for ESLint-plugin-Meteor is best done by using the scaffolding tool.

```bash
$ npm run rule
```

This will scaffold all required files for the new rule. Add the implementation, tests and description of your rule to these files.

After implementation, the rule has to be exported from `lib/index.js`.
Recommended options for the rule should be set as well (also in `lib/index.js`).

## Essential Development Resources

These specs and tools help enormously when developing new rules.

* [ESTree Spec](https://github.com/estree/estree/blob/master/spec.md)
* [Espree Parser](http://eslint.org/parser/)
* [JS AST Explorer](http://astexplorer.net/)
