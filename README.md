# eslint-config-meteor

This is an [ESLint](https://eslint.org) configuration for [Meteor](https://www.meteor.com) apps which implements the recommendations from the [Meteor Guide](https://guide.meteor.com/)'s section on [Code style](https://guide.meteor.com/code-style.html#eslint).

# Usage

## Install

Install by running:

```sh
meteor npm install --save-dev @meteorjs/eslint-config/meteor
```

> Using `meteor npm` is optional for this package, but best-practice for Meteor
  projects in general.

### Peer Dependencies

This package has several `peerDependencies` listed in its `package.json` which will produce warnings if they are not installed when running the install above.

If you're familiar with the process, these can be installed manually, per the [`package.json`](package.json), or you can consider using an automated tool:

```sh
$ # Install `install-peerdeps` within the current Meteor tool version.
$ meteor npm install --global install-peerdeps
$ # Run the newly installed `install-peerdeps` to install this package and its dependencies.
$ meteor install-peerdeps --dev @meteorjs/eslint-config-meteor
```

## Configure

Add the following to your `package.json`:

```json
"eslintConfig": {
  "extends": "@meteorjs/eslint-config-meteor"
}
```

# Todo

- Figure out peerDependency installation.
