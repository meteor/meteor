# Definitions for global Meteor variables based on environment (globals)

This rule defines global variables based on the environment the file is executed in.
This rule never emits warnings on its own. It is meant to be used with ESLint's `no-undef`.

This rule also marks collections defined through settings as globals.

## Rule Details

This rule is meant to be used with ESLint's `no-undef`. This rule marks Meteor's globals as defined. `no-undef` can then warn when undefined variables are used.

The availability of properties on the defined variables is checked in other rules.

Do not use the Meteor environment (`env: meteor` in `.eslintrc` or `$ eslint ./ --env meteor`) when using this rule. This rule exports globals based on file location, while the Meteor environment exports the globals regardless of location. This leads to ESLint thinking a global is defined when it is actually not defined (e.g. `Session` on files in `/server`).

## Usage

```js
{
  'meteor/globals': 1,
  'no-undef': 2
}
```

Collections defined in `.eslintrc`'s settings will be marked as globals as well.

```js

settings: {
  meteor: {
    collections: ['Posts', 'Items'] // all universal collections
  }
}

```

## Further Reading

- http://eslint.org/docs/1.0.0/rules/no-undef
- [list of defined globals](lib/util/data/globalsExportedByPackages.js)


## Possible Improvements

* Define only globals exported from default Meteor packages.
Add option to include other globals separately instead.
