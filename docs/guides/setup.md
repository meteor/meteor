# Setup Guide

*This document describes how to set up ESLint and ESLint-plugin-Meteor in Meteor projects.*
*It must have steps for Meteor projects before 1.3 and with 1.3.*
*It should further show how to use only selected rules (or link to the page of the ESLint documentation)*

TODO


Minimal configuration should look like this:

```json
{
  "env": {
    "es6": true,
    "browser": true,
    "node": true,
    "meteor": true
  },
  "plugins": [
    "meteor"
  ],
  "extends": [
    "plugin:meteor/recommended",
  ]
}
```
