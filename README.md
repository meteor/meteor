ESLint-plugin-Meteor
===================

[![Maintenance Status][status-image]][status-url] [![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][deps-image]][deps-url] [![Coverage Status][coverage-image]][coverage-url] [![Code Climate][climate-image]][climate-url]

Meteor specific linting rules for ESLint

# Installation

Install [ESLint](https://www.github.com/eslint/eslint) either locally or globally.

```sh
$ npm install eslint
```

If you installed `ESLint` globally, you have to install Meteor plugin globally too. Otherwise, install it locally.

```sh
$ npm install eslint-plugin-meteor
```

# Configuration

Add `plugins` section and specify ESLint-plugin-Meteor as a plugin.

```json
{
  "plugins": [
    "meteor"
  ]
}
```


Finally, enable all of the rules that you would like to use.

```json
{
  "rules": {
    "meteor/no-session": 1,
    "meteor/no-blaze-lifecycle-assignment": 2,
    "meteor/no-blaze-zero-timeout": 2
  }
}
```

# List of supported rules

* [no-session](docs/rules/no-session.md): Prevent usage of Session
* [no-blaze-lifecycle-assignment](docs/rules/no-blaze-lifecycle-assignment.md): Prevent deprecated template lifecycle callback assignments
* [no-zero-timeout](docs/rules/no-zero-timeout.md): Prevent usage of Meteor.setTimeout with zero delay

## To Do

* Add more rules.

[Any rule idea is welcome !](https://github.com/dferber90/eslint-plugin-meteor/issues)

## Essential Development Resources

These specs and tools help enormously when developing new rules.
* [ESTree Spec](https://github.com/estree/estree/blob/master/spec.md)
* [Espree Parser](http://eslint.org/parser/)
* [Esprima Parser](http://esprima.org/demo/parse.html#)
* [Yeoman ESLint Generator](https://github.com/eslint/generator-eslint)


# Thanks

This plugin is inspired by [eslint-plugin-react](https://github.com/yannickcr/eslint-plugin-react).

# License

ESLint-plugin-Meteor is licensed under the [MIT License](http://www.opensource.org/licenses/mit-license.php).


[npm-url]: https://npmjs.org/package/eslint-plugin-meteor
[npm-image]: http://img.shields.io/npm/v/eslint-plugin-meteor.svg?style=flat-square

[travis-url]: https://travis-ci.org/dferber90/eslint-plugin-meteor
[travis-image]: http://img.shields.io/travis/dferber90/eslint-plugin-meteor/master.svg?style=flat-square

[deps-url]: https://david-dm.org/dferber90/eslint-plugin-meteor
[deps-image]: https://img.shields.io/david/dev/dferber90/eslint-plugin-meteor.svg?style=flat-square

[coverage-url]: https://coveralls.io/github/dferber90/eslint-plugin-meteor?branch=master
[coverage-image]: http://img.shields.io/coveralls/dferber90/eslint-plugin-meteor/master.svg?style=flat-square

[climate-url]: https://codeclimate.com/github/dferber90/eslint-plugin-meteor
[climate-image]: http://img.shields.io/codeclimate/github/dferber90/eslint-plugin-meteor.svg?style=flat-square

[status-url]: https://github.com/dferber90/eslint-plugin-meteor/pulse
[status-image]: http://img.shields.io/badge/status-maintained-brightgreen.svg?style=flat-square
