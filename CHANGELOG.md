# CHANGELOG

## v1.7.1, 2020-01-13
It makes cordova-plugin-meteor-webapp ready for Cordova 9.
- changes context.requireCordovaModule to require for non-Cordova modules
- removes .woff content type test because it never worked
- updates travis test to use recent versions
- removes .paramedic.config.js and use options directly on package.json
- declares xcode as npm dependency
- updates dev dependencies
- updates DEVELOPMENT.md