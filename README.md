# ESLint-plugin-Meteor

Meteor specific linting rules for ESLint

[![Build Status][travis-image]][travis-url]
[![Coverage Status][coverage-image]][coverage-url]
[![Code Climate][climate-image]][climate-url]
[![Dependency Status][deps-image]][deps-url]

[![Join the chat at https://gitter.im/dferber90/eslint-plugin-meteor][gitter-image]][gitter-url]
[![Maintenance Status][status-image]][status-url]
[![semantic-release][semantic-release-image]][semantic-release]
[![Commitizen friendly][commitizen-image]][commitizen]

[![NPM version][npm-image]][npm-url]
[![NPM downloads][npm-downloads-image]][npm-url]



![Example](https://raw.githubusercontent.com/dferber90/eslint-plugin-meteor/master/docs/media/epm.gif)

*This gif shows integration of ESLint-plugin-Meteor into Atom. Find out more in the [integration guide](docs/guides/integration.md).*


# Quickstart
## Installation

Install [ESLint](https://www.github.com/eslint/eslint) and this plugin either locally or globally.

```sh
$ npm install eslint --save-dev
$ npm install eslint-plugin-meteor --save-dev
```


## Configuration

Add these keys to your `.eslintrc.json` file:

```json
{
  "plugins": ["meteor"],
  "extends": ["plugin:meteor/recommended"]
}
```

For a more thorough introduction, read the [setup guide](/docs/guides/setup.md).

An article with detailed setup instructions can be found [here](https://medium.com/@dferber90/linting-meteor-8f229ebc7942).

# List of supported rules

## Best Practices

* General
  * [no-zero-timeout](docs/rules/no-zero-timeout.md): Prevent usage of Meteor.setTimeout with zero delay
* Session
  * [no-session](docs/rules/no-session.md): Prevent usage of Session
  * [prefer-session-equals](docs/rules/prefer-session-equals.md): Prefer `Session.equals` in conditions
* Security
  * [audit-argument-checks](docs/rules/audit-argument-checks.md): Enforce check on all arguments passed to methods and publish functions
* Blaze
  * [template-names](docs/rules/template-names.md): Naming convention for templates
  * [no-template-lifecycle-assignments](docs/rules/no-template-lifecycle-assignments.md): Prevent deprecated template lifecycle callback assignments
  * [eventmap-params](docs/rules/eventmap-params.md): Force consistent event handler parameter names in event maps
  * [prefix-eventmap-selectors](docs/rules/prefix-eventmap-selectors.md): Convention for eventmap selectors
  * [scope-dom-lookups](docs/rules/scope-dom-lookups.md): Scope DOM lookups to the template instance
  * [no-dom-lookup-on-created](docs/rules/no-dom-lookup-on-created.md): Forbid DOM lookups in template creation callback
  * [no-template-parent-data](docs/rules/no-template-parent-data.md): Avoid accessing template parent data

## Core API
* *currently no rules implemented*

[Any rule idea is welcome !](https://github.com/dferber90/eslint-plugin-meteor/issues)

## Recommended Configuration

This plugin exports a recommended configuration which enforces good Meteor practices.
The rules enabled in this configuration can be found in [`lib/index.js`](https://github.com/dferber90/eslint-plugin-meteor/blob/master/lib/index.js).

To enable the recommended configuration use the extends property in your `.eslintrc` config file:

```json
{
  "plugins": [
    "meteor"
  ],
  "extends": ["eslint:recommended", "plugin:meteor/recommended"]
}
```

See [ESLint documentation](http://eslint.org/docs/user-guide/configuring#extending-configuration-files) for more information about extending configuration files.

## Limitations

ESLint-plugin-Meteor is not aware of where files are going to be executed, to keep the plugin simple.
It will not warn when accessing client-only features on the server and vice versa.

# Contributing

Read about [set up of the development environment](/docs/guides/development.md).

# Thanks

This plugin is inspired by [eslint-plugin-react](https://github.com/yannickcr/eslint-plugin-react).

# License

ESLint-plugin-Meteor is licensed under the [MIT License](http://www.opensource.org/licenses/mit-license.php).


[gitter-image]: https://img.shields.io/badge/gitter-chat-e10079.svg?style=flat-square
[gitter-url]: https://gitter.im/dferber90/eslint-plugin-meteor?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge

[npm-url]: https://npmjs.org/package/eslint-plugin-meteor
[npm-image]: http://img.shields.io/npm/v/eslint-plugin-meteor.svg?style=flat-square
[npm-downloads-image]: https://img.shields.io/npm/dt/eslint-plugin-meteor.svg?style=flat-square

[travis-url]: https://travis-ci.org/dferber90/eslint-plugin-meteor
[travis-image]: http://img.shields.io/travis/dferber90/eslint-plugin-meteor/master.svg?style=flat-square

[deps-url]: https://david-dm.org/dferber90/eslint-plugin-meteor
[deps-image]: https://img.shields.io/david/dev/dferber90/eslint-plugin-meteor.svg?style=flat-square

[coverage-url]: https://coveralls.io/github/dferber90/eslint-plugin-meteor?branch=master
[coverage-image]: http://img.shields.io/coveralls/dferber90/eslint-plugin-meteor/master.svg?style=flat-square

[climate-url]: https://codeclimate.com/github/dferber90/eslint-plugin-meteor
[climate-image]: http://img.shields.io/codeclimate/github/dferber90/eslint-plugin-meteor.svg?style=flat-square

[status-url]: https://github.com/dferber90/eslint-plugin-meteor/pulse
[status-image]: http://img.shields.io/badge/status-maintained-e10079.svg?style=flat-square

[semantic-release-image]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=flat-square
[semantic-release]: https://github.com/semantic-release/semantic-release

[commitizen-image]: https://img.shields.io/badge/commitizen-friendly-e10079.svg?style=flat-square
[commitizen]: http://commitizen.github.io/cz-cli/
