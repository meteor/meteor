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

This plugin uses ES2015 which is transpiled to ES5 by Babel. All files in `lib/` are transpiled to `dist/`.

```bash
# start transpiling continuously
$ npm run build:w

# make some changes to the code

# run tests
$ npm run unit-test
```

## Linking

npm can link packages. This makes version set up for development available in other projects. It enables testing new rules on real projects. To be able to link this package to another project, that one has to be [set up correctly first](SETUP_METEOR_PROJECT.md).

```bash
# Make this package available globally
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

After implementing the rules, the rule has to be exported from `lib/index.js`.
Default options for the rule have to be set as well (also in `lib/index.js`).
All rules must be disabled by default.

## ESLint-plugin-Meteor

Rules defined in this plugin differ from regular ESLint rules. Meteor treats files differently based on their name and location in the project. Rules defined in ESLint-plugin-Meteor can access this information through *getMeta*. This function takes the full filename and returns meta information based on it's location in the Meteor project. A look at the existing rules should explain the concept.

## Give back

After making sure all tests pass and the test-coverage is at 100%, please send a PR to [dferber90/eslint-plugin-meteor](https://github.com/dferber90/eslint-plugin-meteor).

## Essential Development Resources

These specs and tools help enormously when developing new rules.
* [ESTree Spec](https://github.com/estree/estree/blob/master/spec.md)
* [Espree Parser](http://eslint.org/parser/)
* [JS AST Explorer](http://felix-kling.de/esprima_ast_explorer/)
