# @meteorjs/eslint-config-meteor

This is an [ESLint](https://eslint.org) configuration for [Meteor](https://www.meteor.com) apps which implements the recommendations from the [Meteor Guide](https://guide.meteor.com/)'s section on [Code style](https://guide.meteor.com/code-style.html#eslint).

# Usage

## Install

Install by running:

```sh
meteor npm install --save-dev @meteorjs/eslint-config-meteor
```

> Using `meteor npm` is optional for this package, but best-practice for Meteor projects in general.

### Peer Dependencies

This package has several [peer dependencies](https://nodejs.org/en/blog/npm/peer-dependencies/) listed in its [`package.json`'s `peerDependencies` section](package.json).  Warnings will be encountered during the installation step above if the project doesn't already use these modules.

The peer dependencies can be installed manually by following the `package.json` specification and using `meteor npm install --save-dev <package>` or, alternatively, using an automated tool:

```sh
$ # Install `install-peerdeps` within the current Meteor tool version.
$ meteor npm install --global install-peerdeps
$ # Run the newly installed `install-peerdeps` to install this package and its dependencies.
$ meteor install-peerdeps --dev @meteorjs/eslint-config-meteor
```

## Configure

Add the following to the project's `package.json`:

```json
"eslintConfig": {
  "extends": "@meteorjs/eslint-config-meteor"
}
```
