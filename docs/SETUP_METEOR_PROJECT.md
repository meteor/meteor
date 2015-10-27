# Setup Meteor Project
This document describes setting up linting with ESLint-plugin-Meteor in a Meteor project. After completing the steps, it will be possible to lint the project from the command line. Further, the editor will be able to share the settings with the Meteor project.

The instructions here require a basic understanding of npm.

## npm
Make sure you have installed npm. Verify this by running

```bash
$ npm -v
```

## Initializing
Next, your Meteor project has to be turned into a npm package as well. At the root of your Meteor project run the following commands. You can simply go with the default values for everything `npm init` asks you about, or you can set your own values.

```bash
$ npm init
```

This will initialize npm in your project by creating `package.json`. This is the control file for npm. It stores information about your project, like the name, available scripts and dependencies.


## Adding ESLint
```bash
# Run this. It will print some warnings. See below for explanation
$ npm install eslint --save-dev

```

This installs ESLint. The `--save-dev` option tells npm to save `eslint` as a development dependency in `package.json`. This enables anybody collaborating on the project with you to simply do `npm install` after cloning your repository and they’ll have ESLint available at the same version.

You will get the following warnings after `npm install eslint`.

```bash
$ npm install eslint --save-dev
npm WARN EPACKAGEJSON meteor-project@1.0.0 No description
npm WARN EPACKAGEJSON meteor-project@1.0.0 No repository field.
```

You can get rid of this warning by adding `private: true` to your `package.json`. This tells npm to never publish this folder to npm. This prevents you publishing your private source code by accidentally with `npm publish`. Now that the package is declared as private, the warnings will disappear as well, because private packages don’t need to have these fields filled out.

## Adding an *npm script*

Great, ESLint is installed. It can now be run with

```bash
$ node_modules/eslint/bin/eslint.js .
```

But this is a little bit hard to remember, so npm scripts can be used instead. Add the following to your `package.json`.

```json
"scripts": {
  "lint": "eslint ."
}
```

Now the project can be linted with

```bash
$ npm run lint
```

Any script defined in `package.json` runs cli commands. Modules installed into *node_modules* (like *eslint*) will be available without referring to them through their long path. Having all of the development dependencies installed at a fixed version through npm and using them through npm ensures a consistent development environment in teams. It also ensures the Continuous Integration uses the same version of packages, because the CI can simply run `npm install` before testing the project with `npm run lint`.

## Adding rules
Now it's time to add some rules for the project. Let’s forbid the use of semicolons as an example. All available rules of ESLint can be found [here](http://eslint.org/docs/rules/).
Create a dot-file called *.eslintrc* at the root of the project and add the contents below.

```json
{
  "rules": {
    "semi": [2, "never"]
  }
}
```

Verify it is working by running the command below.

```bash
$ npm run lint
```

If you have any file in your project that ends with a semicolon, a warning will appear.
We have now verified that the linter works. Now Meteor specific rules can be added.

## Adding ESLint-plugin-Meteor
Add ESLint-plugin-Meteor by running

```bash
$ npm install eslint-plugin-meteor --save-dev
```

This will install *eslint-plugin-meteor* and save it as a development dependency, just like *eslint* above.

Now, ESLint needs to be told about the ESLint-plugin-Meteor. Edit *.eslintrc* at the root of the project and add the contents below.

```json
{
  "plugins": [ "eslint-plugin-meteor" ]
}
```

## Adding rules
Now Meteor specific rules can be added to the project.


The *.eslintrc* file should now look like this:
```json
{
  "plugins": [ "eslint-plugin-meteor" ],
  "rules": {
    "semi": [2, "never"],
    "meteor/no-session": 2
  }
}
```

The options for Meteor specific rules provided by this plugin are explained [here](docs/rules/).

## Makng ESLint understand ES2015
By default ESLint is able to parse any ES5 file. Support for ES2015 can be added by defining a custom parser. ESLint needs to be told about the parser. Extend *.eslintrc* at the root of the project and add the contents below.

```json
"parser": "babel-eslint"
```

Now *eslint* will try to use *babel-eslint* as the parser for the JavaScript files. So, *babel-eslint* has to be installed as well.

```bash
$ npm install babel-eslint --save-dev
```

The *.eslintrc* file should now look like this:
```json
{
  "parser": "babel-eslint",
  "plugins": [ "eslint-plugin-meteor" ],
  "rules": {
    "semi": [2, "never"],
    "meteor/no-session": 2
  }
}
```

## Packages
A common way to structure Meteor projects is to use packages. ESLint-plugin-Meteor can not determine where files in packages are going to be executed. All rules will be turned off inside package files by default, until an environment is specified through a comment.

A hint about the environment of the file has to be included in each file that should be linted in a package.

The following comment tells ESLint-plugin-Meteor that this file is going to be executed on the client.

```js
/* eslint-meteor-env client */
```

If a file is going to run on the client and the server, use the following instead.

```js
/* eslint-meteor-env client, server */
```

These environments can be combined in any way. Possible values are `client` and `server`.

Environments from multiple comments in a single file will be merged. Specifying unknown environments will result in no environment being detected. Specifying environments in a file outside of a package will overwrite the environment detected by the file location.


## Example
A complete example of how to set up ESLint-plugin-Meteor in your project can be found [here](https://github.com/wekan/wekan/pull/370).

## Next steps
Set up ESLint to work with your editor to benefit fully from linting.
