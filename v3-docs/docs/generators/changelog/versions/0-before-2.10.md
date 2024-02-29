


## v2.9.1, 2022-12-27

### Highlights

* Reverted missing types [PR](https://github.com/meteor/meteor/pull/12366) by [Grubba27](https://github.com/Grubba27).
* Fix fetch() type declaration [PR](https://github.com/meteor/meteor/pull/12352) by [zarvox](https://github.com/zarvox).
* update svelte skeleton [PR](https://github.com/meteor/meteor/pull/12350) by [tosinek](https://github.com/tosinek).
* Bump to node 14.21.2.0 [PR](https://github.com/meteor/meteor/pull/12370) by [Grubba27](https://github.com/Grubba27).
* resetPassword and verifyEmail to no longer sign in the user automatically [PR](https://github.com/meteor/meteor/pull/12385) by [denihs](https://github.com/denihs).
* Added missing vue2 declaration for skeletons [PR](https://github.com/meteor/meteor/pull/12396) by [Grubba27](https://github.com/Grubba27) & [mlanning](https://github.com/mlanning).

#### Breaking Changes

* `accounts-password@2.3.3`
    - The methods `resetPassword` and `verifyEmail` no longer logs the user if they have 2FA enabled. Now, the functions work as before, but instead of automatically logging in the user at the end, an error with the code `2fa-enabled` will be thrown.


####  Internal API changes

N/A

#### Migration Steps

N/A

#### Meteor Version Release

* `fetch@0.1.3`:
    - Updated fetch type definition.

* `meteor@1.10.4`:
    - Added back meteor type definitions that were removed by mistake in earlier version.

* `accounts-password@2.3.3`
    - The methods `resetPassword` and `verifyEmail` no longer logs the user if they have 2FA enabled. Now, the functions work as before, but instead of automatically logging in the user at the end, an error with the code `2fa-enabled` will be thrown.

* `Command line`:
    - Updated Svelte skeleton to now be able to support typescript out of the box and added ``#each`` in links in the skeleton.
    - Updated node to 14.21.2 changes can be seen [here](https://github.com/nodejs/node/releases/tag/v14.21.2).
    - Solved [issue](https://github.com/meteor/meteor/issues/12395) that could not allow vue2 apps being created in command line.

#### Special thanks to
- [@zarvox](https://github.com/zarvox).
- [@tosinek](https://github.com/tosinek).
- [@Grubba27](https://github.com/Grubba27).
- [@denihs](https://github.com/denihs).
- [@mlanning](https://github.com/mlanning).

For making this great framework even better!


## v2.9, 2022-12-12

### Highlights

* TypeScript update to v4.6.4 [PR](https://github.com/meteor/meteor/pull/12204) by [@StorytellerCZ](https://github.com/StorytellerCZ).
* Create Email.sendAsync method without using Fibers [PR](https://github.com/meteor/meteor/pull/12101)
  by [edimarlnx](https://github.com/edimarlnx).
* Create async method CssTools.minifyCssAsync [PR](https://github.com/meteor/meteor/pull/12105)
  by  [edimarlnx](https://github.com/edimarlnx).
* Change Accounts and Oauth to use Async methods [PR](https://github.com/meteor/meteor/pull/12156)
  by [edimarlnx](https://github.com/edimarlnx).
* TinyTest package without Future [PR](https://github.com/meteor/meteor/pull/12222)
  by [matheusccastroo](https://github.com/matheusccastroo).
* Feat: user accounts base async [PR](https://github.com/meteor/meteor/pull/12274)
  by [Grubba27](https://github.com/Grubba27).
* Move somed methods from OAuth of out of accounts-base [PR](https://github.com/meteor/meteor/pull/12202)
  by [StorytellerCZ](https://github.com/StorytellerCZ).
* Feat: not using insecure & autopublish [PR](https://github.com/meteor/meteor/pull/12220)
  by [Grubba27](https://github.com/Grubba27).
* Don't apply babel async-await plugin when not running on Fibers [PR](https://github.com/meteor/meteor/pull/12221).
  by [matheusccastroo](https://github.com/matheusccastroo).
* Implemented Fibers-less MongoDB count methods [PR](https://github.com/meteor/meteor/pull/12295)
  by [radekmie](https://github.com/radekmie).
* Feat: Generate scaffold in cli [PR](https://github.com/meteor/meteor/pull/12298)
  by [Grubba27](https://github.com/Grubba27).
* Update types [PR](https://github.com/meteor/meteor/pull/12306) by [piotrpospiech](https://github.com/piotrpospiech).
* Remove underscore from package-version-parser [PR](https://github.com/meteor/meteor/pull/12248)
  by [harryadel](https://github.com/harryadel).
* Update MongoDB driver version [PR](https://github.com/meteor/meteor/pull/12333) by [Grubba27](https://github.com/Grubba27).
* New Vue3 Skeleton [PR](https://github.com/meteor/meteor/pull/12302)
  by [henriquealbert](https://github.com/henriquealbert).

#### Breaking Changes
* `Accounts.createUserVerifyingEmail` is now async

####  Internal API changes
* Internal methods from `OAuth` that are now async:
    - _attemptLogin
    - _loginMethod
    - _runLoginHandlers
    - OAuth.registerService now accepts async functions

OAuth related code has been moved from `accounts-base` to `accounts-oauth`, removing the dependency on `service-configuration`
more can be seen in this [discussion](https://github.com/meteor/meteor/discussions/12171) and in the [PR](https://github.com/meteor/meteor/pull/12202).
This means that if you don’t use third-party login on your project, you don’t need to add the package service-configuration anymore.

#### Migration Steps

You can follow in [here](https://guide.meteor.com/2.9-migration.html).

#### Meteor Version Release

* `eslint-plugin-meteor@7.4.0`:
    - updated Typescript deps and meteor babel.
* `eslint-plugin-meteor@7.4.0`:
    - updated Typescript deps and meteor babel.
* `accounts-base@2.2.6`
    - Moved some functions to accounts-oauth.
* `accounts-oauth@1.4.2`
    - Received functions from accounts-base.
* `accounts-password@2.3.2`
    - Asyncfied functions such as `changePassword`, `forgotPassword`, `resetPassword`, `verifyEmail`, `setPasswordAsync`.
* `babel-compiler@7.10.1`
    - Updated babel to 7.17.1.
* `email@2.2.3`
    - Create Email.sendAsync method without using Fibers.
* `facebook-oauth@1.11.2`
    - Updated facebook-oauth to use async functions.
* `github-oauth@1.4.1`
    - Updated github-oauth to use async functions.
* `google-oauth@1.4.3`
    - Updated google-oauth to use async functions.
* `meetup-oauth@1.1.2`
    - Updated meetup-oauth to use async functions.
* `meteor-developer-oauth@1.3.2`
    - Updated meteor-developer-oauth to use async functions.
* `meteor@1.10.3`
    - Added Async Local Storage helpers.
* `minifier-css@1.6.2`
    - Asyncfied `minifyCss` function.
* `minimongo@1.9.1`
    - Implemented Fibers-less MongoDB count methods.
* `mongo@1.16.2`
    - Implemented Fibers-less MongoDB count methods.
* `npm-mongo@4.12.1`
    - Updated npm-mongo to 4.12.
* `oauth@2.1.3`
    - Asyncfied methods.
* `oauth1@1.5.1`
    - Asyncfied methods.
* `oauth2@1.3.2`
    - Asyncfied methods.
* `package-version-parser@3.2.1`
    - Removed underscore.
* `promise@0.12.2`
    - Added DISABLE_FIBERS flag.
* `standard-minifier-css@1.8.3`
    - Asyncfied minify method.
* `test-helpers@1.3.1`
    - added runAndThrowIfNeeded function.
* `test-in-browser@1.3.2`
    - Adjusted e[type] to e.type
* `tinytest@1.2.2`
    - TinyTest package without Future.
* `twitter-oauth@1.3.2`
    - Asyncfied methods.
* `typescript@4.6.4`
    - updated typescript to 4.6.4.
* `weibo-oauth@1.3.2`
    - Asyncfied methods.

#### Special thanks to
- [@henriquealbert](https://github.com/henriquealbert);
- [@edimarlnx](https://github.com/edimarlnx);
- [@matheusccastroo](https://github.com/matheusccastroo);
- [@Grubba27](https://github.com/Grubba27);
- [@StorytellerCZ](https://github.com/StorytellerCZ);
- [@radekmie](https://github.com/radekmie);
- [@piotrpospiech](https://github.com/piotrpospiech);
- [@harryadel](https://github.com/harryadel);

For making this great framework even better!


## v2.8.2, 2022-11-29

#### Highlights
* `mongo@1.16.2`:
    - Make count NOT create a cursor. [PR](https://github.com/meteor/meteor/pull/12326).
* `meteorjs/babel@7.16.1-beta.0`
    - Adjusted config to  Auto import React on jsx,tsx files [PR](https://github.com/meteor/meteor/pull/12327).
    - needs to use directly from npm the meteorjs/babel@7.16.1-beta.0.

#### Breaking Changes
N/A

#### Migration Steps

#### Meteor Version Release
* `mongo@1.16.2`:
    - Make count NOT create a cursor. [PR](https://github.com/meteor/meteor/pull/12326).

#### Special thanks to
- [@henriquealbert](https://github.com/henriquealbert);
- [@znewsham](https://github.com/znewsham);

For making this great framework even better!



## v2.8.1, 2022-11-14

#### Highlights

- modernize tools/run-updater.js by [afrokick](https://github.com/afrokick)
- feat(error message): Especifing error message when cross-boundary by [Grubba27](https://github.com/Grubba27)
- Type definitions for core packages by [piotrpospiech](https://github.com/piotrpospiech)
- Add https proxy support to meteor-installer by [heschong](https://github.com/heschong)
- Fix case insensitive lookup resource overuse by [ToyboxZach](https://github.com/ToyboxZach)
- Update default Facebook API to v15 and fix local changelog by [StorytellerCZ](https://github.com/StorytellerCZ)
- Bump to Node v14.21.1 by [StorytellerCZ](https://github.com/StorytellerCZ)
- Use true mongo binary types by [znewsham](https://github.com/znewsham)
- Add docs for Accounts.registerLoginHandler by [shivam1646](https://github.com/shivam1646)
- Updated MongoDB driver to 4.11 by [radekmie](https://github.com/radekmie)
- Show port in restart message by [harryadel](https://github.com/harryadel)
- In the client, don't wait if the stub doesn't return a promise by [denihs](https://github.com/denihs)
- The rest of type definitions for core packages by [piotrpospiech](https://github.com/piotrpospiech)
- Removing underscore in packages by [harryadel](https://github.com/harryadel):
    - [twitter-oauth] Remove underscore
    - [test-in-browser] Remove underscore
    - [webapp-hashing] Remove underscore
    - [browser-policy] Remove underscore
    - [ecmascript] Remove underscore
    - [browser-policy-framing] Remove underscore
    - [diff-sequence] Remove underscore
    - [facts-ui] Remove underscore
    - [geojson-utils] Remove underscore

#### Breaking Changes

N/A

#### Migration Steps

_In case you want types in your app using the core packages types/zodern:types (now you do have the option)_

1. Remove `@types/meteor` package
2. Install [`zodern:types`](https://github.com/zodern/meteor-types) package
3. Follow [installation guide for the Meteor Apps](https://github.com/zodern/meteor-types#meteor-apps) to update

#### Meteor Version Release

* `accounts-base@2.2.5`
    - added types for package.
* `browser-policy@1.1.1`
    - adjusted package tests.
* `browser-policy-common@1.0.12`
    - added types for package.
* `browser-policy-framing@1.1.1`
    - removed underscore.
* `check@1.3.2`
    - added types for package.
* `ddp@1.4.0`
    - added types for package.
* `ddp-client@2.6.1`
    - In the client, don't wait if the stub doesn't return a promise.
* `ddp-rate-limiter@1.1.1`
    - added types for package.
* `diff-sequence@1.1.2`
    - removed underscore.
* `ecmascript@0.16.3`
    - removed underscore.
* `ejson@1.1.3`
    - added types for package.
* `ejson@2.2.2`
    - added types for package.
* `facebook-oauth@1.12.0`
    - Updated default version of Facebook GraphAPI to v15
* `facts-ui@1.0.1`
    - removed underscore.
* `fetch@0.1.2`
    - added types for package.
* `geojson-utils@1.0.11`
    - removed underscore.
* `hot-module-replacement@0.5.2`
    - added types for package.
* `meteor@1.10.2`
    - added types for package.
* `modern-browsers@0.1.9`
    - added types for package.
* `modules-runtime@0.13.2`
    - added accurate error messages.
* `modules-runtime-hot@0.14.1`
    - added accurate error messages.
* `mongo@1.16.1`
    - added types for package.
    - added true mongo binary
* `npm-mongo@4.11.0`
    - updated npm mongo version to match npm one.
* `promise@0.13.0`
    - added types for package.
* `random@1.2.1`
    - added types for package.
* `reactive-dict@1.3.1`
    - added types for package.
* `reactive-dict@1.0.12`
    - added types for package.
* `server-render@0.4.1`
    - added types for package.
* `service-configuration@1.3.1`
    - added types for package.
* `session@1.2.1`
    - added types for package.
* `test-in-browser@1.3.1`
    - removed underscore.
* `tracker@1.2.1`
- added types for package.
* `twitter-oauth@1.3.1`
    - removed underscore.
* `underscore@1.0.11`
    - added types for package.
* `webapp@1.13.2`
    - added types for package.
* `webapp-hashing@1.1.1`
    - added types for package.
## v2.8, 2022-10-19

#### Highlights
* New MongoDB Package Async API. [PR](https://github.com/meteor/meteor/pull/12028)
* Node update to [v14.20.1](https://nodejs.org/en/blog/release/v14.20.1/) as part of the [September 22nd security release](https://nodejs.org/en/blog/vulnerability/september-2022-security-releases/)
* Update MongoDB driver to 4.9. [PR](https://github.com/meteor/meteor/pull/12097)
* Meteor.callAsync method. [PR](https://github.com/meteor/meteor/pull/12196)
* Added new Chakra-ui Skeleton. [PR](https://github.com/meteor/meteor/pull/12181)
* Added new Solid Skeleton. [PR](https://github.com/meteor/meteor/pull/12186)

#### Breaking Changes
N/A

#### Migration Steps
Read our [Migration Guide](https://guide.meteor.com/2.8-migration.html) for this version.

#### Meteor Version Release
* `modules@0.19.0`:
    - Updating reify version. [PR](https://github.com/meteor/meteor/pull/12055).
* `minimongo@1.9.0`:
    - New methods to work with the Async API. [PR](https://github.com/meteor/meteor/pull/12028).
    - Solved invalid dates in Minimongo Matcher [PR](https://github.com/meteor/meteor/pull/12165).
* `mongo@1.16.0`:
    - Adding async counterparts that allows gradual migration from Fibers. [PR](https://github.com/meteor/meteor/pull/12028).
    - Improved oplogV2V1Converter implementation. [PR](https://github.com/meteor/meteor/pull/12116).
    - Exit on MongoDB connection error. [PR](https://github.com/meteor/meteor/pull/12115).
    - Fixed MongoConnection._onFailover hook. [PR](https://github.com/meteor/meteor/pull/12125).
    - Fixed handling objects in oplogV2V1Converter. [PR](https://github.com/meteor/meteor/pull/12107).
* `meteor@1.10.1`:
    - Create method to check if Fibers is enabled by flag DISABLE_FIBERS. [PR](https://github.com/meteor/meteor/pull/12100).
    - Fix bugs for linter build plugins. [PR](https://github.com/meteor/meteor/pull/12120).
    - Document meteor show METEOR. [PR](https://github.com/meteor/meteor/pull/12124).
    - Update Cordova Android to 10.1.2. [PR](https://github.com/meteor/meteor/pull/12131).
    - Fixed flaky test. [PR](https://github.com/meteor/meteor/pull/12129).
    - Refactoring/Remove unused imports from tools folder. [PR](https://github.com/meteor/meteor/pull/12084).
    - Fix problem when publishing async methods. [PR](https://github.com/meteor/meteor/pull/12152).
    - Update skeletons Apollo[PR](https://github.com/meteor/meteor/pull/12091) and other skeletons [PR](https://github.com/meteor/meteor/pull/12099)
    - Added callAsync method for calling async methods [PR](https://github.com/meteor/meteor/pull/12196).
* `meteor-installer@2.7.5`:
    - Validates required Node.js version. [PR](https://github.com/meteor/meteor/pull/12066).
* `npm-mongo@4.9.0`:
    - Updated MongoDB driver to 4.9. [PR](https://github.com/meteor/meteor/pull/12163).
* `@meteorjs/babel@7.17.0`
    - Upgrade TypeScript to `4.6.4`
* `babel-compiler@7.10.0`
    - Upgrade TypeScript to `4.6.4`
* `ecmascript@0.16.3`
    - Upgrade TypeScript to `4.6.4`
* `typescript@4.6.4`
    - Upgrade TypeScript to `4.6.4`
* `eslint-plugin-meteor@7.4.0`
    - Upgrade TypeScript to `4.6.4`

#### Independent Releases
* `accounts-passwordless@2.1.3`:
    - Fixing bug where tokens where never expiring. [PR](https://github.com/meteor/meteor/pull/12088).
* `accounts-base@2.2.4`:
    - Adding new options to the `Accounts.config()` method: `loginTokenExpirationHours` and `tokenSequenceLength`. [PR](https://github.com/meteor/meteor/pull/12088).
* `Meteor Repo`:
    - Included githubactions in the dependabot config. [PR](https://github.com/meteor/meteor/pull/12061).
    - Visual rework in meteor readme. [PR](https://github.com/meteor/meteor/pull/12133).
    - Remove useraccounts from Guide. [PR](https://github.com/meteor/meteor/pull/12090).
* `minifier-css@1.6.1`:
    - Update postcss package to avoid issues with `Browserslist` and `caniuse-lite`. [PR](https://github.com/meteor/meteor/pull/12136).
* `minifier-js@2.7.5`:
    - Update terser package due to security fixes and to take advantage of terser improvements. [PR](https://github.com/meteor/meteor/pull/12137).
* `standard-minifier-css@1.8.2`:
    - Update dependencies to avoid issues with `Browserslist` and `caniuse-lite`. [PR](https://github.com/meteor/meteor/pull/12141).
* `standard-minifier-js@2.8.1`:
    - Update dependencies to avoid issues with `Browserslist` and `caniuse-lite`. [PR](https://github.com/meteor/meteor/pull/12142).
* `ddp-server@2.5.1`:
    - Rename setPublicationStrategy and getPublicationStrategy arguments. [PR](https://github.com/meteor/meteor/pull/12166).

#### Special thanks to
- [@fredmaiaarantes](https://github.com/fredmaiaarantes)
- [@radekmie](https://github.com/radekmie)
- [@naveensrinivasan](https://github.com/naveensrinivasan)
- [@zodern](https://github.com/zodern)
- [@brucejo75](https://github.com/brucejo75)
- [@matheusccastroo](https://github.com/matheusccastroo)
- [@victoriaquasar](https://github.com/victoriaquasar)
- [@StorytellerCZ](https://github.com/StorytellerCZ)
- [@Grubba27](https://github.com/Grubba27)
- [@denihs](https://github.com/denihs)
- [@edimarlnx](https://github.com/edimarlnx)

For making this great framework even better!

## v2.7.3, 2022-05-3

#### Highlights
* `accounts-passwordless@2.1.2`:
    - Throwing an error when the login tokens are not generated well calling requestLoginTokenForUser. [PR](https://github.com/meteor/meteor/pull/12047/files).
* Node updated to v14.19.3
* npm update to v6.14.17
* Fix recompiling npm packages for web arch. [PR](https://github.com/meteor/meteor/pull/12023).

#### Breaking Changes
N/A

#### Migration Steps

#### Meteor Version Release
* `accounts-passwordless@2.1.2`:
    - Throwing an error when the login tokens are not generated well calling requestLoginTokenForUser. [PR](https://github.com/meteor/meteor/pull/12047/files).
* `babel-runtime@1.5.1`:
    - Make client 25kb smaller. [PR](https://github.com/meteor/meteor/pull/12051).
* Node updated to v14.19.3
* npm update to v6.14.17
* Fix win style paths being added to watch sets.
* Fix recompiling npm packages for web arch. [PR](https://github.com/meteor/meteor/pull/12023).

## v2.7.2, 2022-05-10

#### Highlights

#### Breaking Changes
N/A
#### Migration Steps

#### Meteor Version Release

* `mongo@1.15.0`
    - New option `Meteor.settings.packages.mongo.reCreateIndexOnOptionMismatch` for case when an index with the same name, but different options exists it will be re-created.
    - If there is an error on index creation Meteor will output a better message naming the collection and index where the error occured. [PR](https://github.com/meteor/meteor/pull/11995).
* `modern-browsers@0.1.8`
    - New api `getMinimumBrowserVersions` to access the `minimumBrowserVersions`. [PR](https://github.com/meteor/meteor/pull/11998).
* `socket-stream-client@0.5.0`
    - Ability to disable sockjs on client side. [PR](https://github.com/meteor/meteor/pull/12007/).
* `meteor-node-stubs@1.2.3`:
    - Fix using meteor-node-stubs in IE. [PR](https://github.com/meteor/meteor/pull/12014).
* New ARCH environment variable that permit users to set uname info. [PR](https://github.com/meteor/meteor/pull/12020).
* Skeleton dependencies updated.
* New Tailwind skeleton. [PR](https://github.com/meteor/meteor/pull/12000).

#### Independent Releases

## v2.7.1, 2022-03-31

#### Highlights

#### Breaking Changes

* `accounts-2fa@2.0.0`
    - The method `has2faEnabled` no longer takes a selector as an argument, just the callback.
    - `generate2faActivationQrCode` now throws an error if it's being called when the user already has 2FA enabled.

#### Migration Steps

#### Meteor Version Release

* `accounts-2fa@2.0.0`
    - Reduce one DB call on 2FA login. [PR](https://github.com/meteor/meteor/pull/11985)
    - Throw error when user is not found on `Accounts._is2faEnabledForUser`
    - Remove vulnerability from the method `has2faEnabled`
    - Now the package auto-publish the field `services.twoFactorAuthentication.type` for logged in users.
* `accounts-password@2.3.1`
    - Use method `Accounts._check2faEnabled` when validating 2FA
* `accounts-passwordless@2.1.1`
    - Use method `Accounts._check2faEnabled` when validating 2FA
* `oauth@2.1.2`
    - Check effectively if popup was blocked by browser. [PR](https://github.com/meteor/meteor/pull/11984)
* `standard-minifier-css@1.8.1`
    - PostCSS bug fixes. [PR](https://github.com/meteor/meteor/pull/11987/files)

#### Independent Releases

## v2.7, 2022-03-24

#### Highlights
* Bump node version to 14.19.1
* TailwindCSS 3.x support
* Typescript `4.5.4` upgrade
* New core package: `accounts-2fa`
* Support for 2FA in `accounts-password` and `accounts-passwordless`
* PostCSS's plugins are run by `standard-minifier-css` if the app has PostCSS configured
* App skeletons and test packages were updated to `meteor-node-stubs@1.2.1`

#### Breaking Changes

N/A

#### Migration Steps

Read our [Migration Guide](https://guide.meteor.com/2.7-migration.html) for this version.

#### Meteor Version Release

* `standard-minifier-css@1.8.0`
    - Runs PostCSS plugins if the app has a PostCSS config and the `postcss-load-config` npm package installed. Supports TailwindCSS 3.x [PR 1](https://github.com/Meteor-Community-Packages/meteor-postcss/pull/56) [PR 2](https://github.com/meteor/meteor/pull/11903)

* `react-fast-refresh@0.2.3`
    - Fix tracking states with circular dependencies. [PR](https://github.com/meteor/meteor/pull/11923)

* `accounts-2fa@1.0.0`
    - New package to provide 2FA support

* `accounts-password@2.3.0`
    - 2FA support

* `accounts-passwordless@2.1.0`
    - 2FA support

* `@meteorjs/babel@7.16.0`
    - Upgrade TypeScript to `4.5.4`

* `babel-compiler@7.9.0`
    - Upgrade TypeScript to `4.5.4`

* `ecmascript@0.16.2`
    - Upgrade TypeScript to `4.5.4`

* `typescript@4.5.4`
    - Upgrade TypeScript to `4.5.4` [PR](https://github.com/meteor/meteor/pull/11846)

* `accounts-ui-unstyled@1.6.0`
    - `Accounts.ui.config` can now be set via `Meteor.settings.public.packages.accounts-ui-unstyled`.

* `meteor-tool@2.7`
    - CSS minifiers must now handle any caching themselves [PR](https://github.com/meteor/meteor/pull/11882)
    - CSS minifiers are always given lazy css resources instead of only during production builds [PR](https://github.com/meteor/meteor/pull/11897)
    - Files passed to CSS minifiers now have `file.readAndWatchFileWithHash`, same as for compilers [PR](https://github.com/meteor/meteor/pull/11882)
    - If a minifier has a `beforeMinify` function, it will be called once during each build before the minifier is run the first time [PR](https://github.com/meteor/meteor/pull/11882)
    - Add `Plugin.fs.readdirWithTypesSync` [PR](https://github.com/meteor/meteor/pull/11882)

* `ejson@1.1.2`
    - Fixing error were EJSON.equals fail to compare object and array if first param is object and second is array. [PR](https://github.com/meteor/meteor/pull/11866), [Issue](https://github.com/meteor/meteor/issues/11864).

* `oauth@1.4.1`
    - If OAuth._retrieveCredentialSecret() fails trying to get credentials inside Accounts.oauth.tryLoginAfterPopupClosed(), we call it again once more.

* `accounts-base@2.2.2`
    - Fix an issue where an extra field defined in `defaultFieldSelector` would not get published to the client
    - Proving the login results to the `_onLoginHook` when finishing login inside `callLoginMethod`. [PR](https://github.com/meteor/meteor/pull/11913).

* `github-oauth@1.4.0`
    - More data will be retrieved and saved under `services.github` on the user account.
    - Add option to disallow sign-up on GitHub using `allow_signup` [parameter](https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps#parameters), this will be activated based on your Accounts settings, specifically if the option `forbidClientAccountCreation` is set to `true`.

* `email@2.2.1`
    - Throwing error when trying to send email in a production environment but without a mail URL set. [PR](https://github.com/meteor/meteor/pull/11891), [Issue](https://github.com/meteor/meteor/issues/11709).

* `facebook-oauth@1.11.0`
    - Updated Facebook API to version 12.0

* `google-oauth@1.4.2`
    - Migrate from `http` to `fetch`

* `modules-runtime@0.13.0`
    - Fix some npm modules being imported as an empty object. [PR](https://github.com/meteor/meteor/pull/11954), [Issue 1](https://github.com/meteor/meteor/issues/11900), [Issue 2](https://github.com/meteor/meteor/issues/11853).

* `meteor-node-stubs@1.2.1`
    - Adds support for [node:](https://nodejs.org/api/esm.html#node-imports) imports.

* `minifier-jss@2.8.0`
    - Updating terser. It will fix this [issue](https://github.com/meteor/meteor/issues/11721) and [this](https://github.com/meteor/meteor/issues/11930) one. [PR](https://github.com/meteor/meteor/pull/11983).

#### Independent Releases

## v2.6.1, 2022-02-18

#### Highlights

* Fix regression on build speed by updating babel dependencies to 7.17.x
* We have removed IE 9 from our browser test list
* We are changing the device used for testing, Samsung Galaxy S7, as browserstack is having issues provisioning it. We will be using now Samsung Galaxy Note 10.
* Fix issue when generating tarballs from Windows systems related to execute permissions
* Fix issues with HMR and meteor build --debug [PR](https://github.com/meteor/meteor/pull/11922)


#### Breaking Changes

- IE 9 might not be compatible from now on, although, we will still consider PR's fixing it.

#### Migration Steps

#### Meteor Version Release

* `meteor-tool@2.6.1`
    - Use latest @meteor/babel dependency with @babel@7.17.x

* `@meteorjs/babel@7.15.1`
    - Use babel@7.17.x

* `babel-compiler@7.8.1`
    - Use latest @meteor/babel dependency with @babel@7.17.x

* `hot-module-replacement@0.5.1`
    - Fix issues with HMR and meteor build --debug [PR](https://github.com/meteor/meteor/pull/11922)

* `webapp@1.13.1`
    - Fix issues with HMR and meteor build --debug [PR](https://github.com/meteor/meteor/pull/11922)

#### Independent Releases

* `mongo@1.14.6` at 2022-02-18
    - Remove false-positive warning for supported operation a.0.b:{}
* `mongo@1.14.5` at 2022-02-16
    - Fix multiple array operators bug and add support for debug messages
    - Fix isArrayOperator function regexp false-positive
* `mongo@1.14.4` at 2022-02-11
    - Fix sync return for insert methods inside _collection private method [PR](https://github.com/meteor/meteor/pull/11907)
    - Support the new "projection" field inside the decision of using oplog for a published cursor or not [PR](https://github.com/meteor/meteor/pull/11908)
* `mongo@1.14.3` at 2022-02-08
    - Remove throw on _id exclusion inside mongo collection finds. [PR](https://github.com/meteor/meteor/pull/11894).
* `mongo@1.14.2` at 2022-02-06
    - Fix flatten object issue when internal object value is an array on oplog converter. [PR](https://github.com/meteor/meteor/pull/11888).
* `mongo@1.14.1` at 2022-02-04
    - Fix flatten object issue when the object is empty on oplog converter. [PR](https://github.com/meteor/meteor/pull/11885), [Issue](https://github.com/meteor/meteor/issues/11884).

## v2.6, 2022-02-01

#### Highlights

* MongoDB Node.js driver Upgrade from 3.6.10 to 4.3.1
* MongoDB Server 5.x Support
* Embedded Mongo now uses MongoDB 5.0.5
* You are now able to use dark theme specific splash screens for both iOS and Android by passing an object `{src: 'light-image-src-here.png', srcDarkMode: 'dark-mode-src-here.png'}` to the corresponding key in `App.launchScreens`

#### Breaking Changes

* `mongo@1.14.0`
    - This is not a breaking change in Meteor itself but as this is a major upgrade in the MongoDB Node.js driver you should read the [Migration Guide](https://guide.meteor.com/2.6-migration.html), especially if you are using rawCollection.

* `meteor-tool@2.6`
    - Legacy launch screens keys for iOS on `App.launchScreens` are now deprecated in favor of new storyboard compliant keys [PR #11797](https://github.com/meteor/meteor/pull/11797). This will drop the following keys we have: `['iphone5','iphone6','iphone6p_portrait','iphone6p_landscape','iphoneX_portrait','iphoneX_landscape','ipad_portrait_2x','ipad_landscape_2x','iphone','iphone_2x','ipad_portrait','ipad_landscape']`. Read the [Migration Guide](https://guide.meteor.com/2.6-migration.html) for more details.

#### Migration Steps

Read our [Migration Guide](https://guide.meteor.com/2.6-migration.html) for this version.

#### Meteor Version Release

* `mongo@1.14.0`
    - `applySkipLimit` option for count() on find cursors is no longer supported. Read more about it [here](https://guide.meteor.com/2.6-migration.html), in the `Cursor.count()` section.
    - internal result of operations inside Node.js MongoDB driver have changed. If you are depending on rawCollection results (not only the effect inside the DB), please review the expected format as we have done [here](https://github.com/meteor/meteor/blob/155ae639ee590bae66237fc1c29295072ec92aef/packages/mongo/mongo_driver.js#L658)
    - useUnifiedTopology is not an option anymore, it defaults to true.
    - native parser is not an option anymore, it defaults to false in the mongo connection.
    - poolSize not an option anymore, we are using max/minPoolSize for the same behavior on mongo connection.
    - fields option is deprecated, we are maintaining a translation layer to "projection" field (now prefered) until the next minor version, where we will start showing alerts.
    - _ensureIndex is now showing a deprecation message
    - we are maintaining a translation layer for the new oplog format, so if you read or rely on any behavior of it please read our oplog_v2_converter.js code
    - update/insert/remove behavior is maintained in the Meteor way, documented in our docs, but we are now using replaceOne/updateOne/updateMany internally. This is subject to changes in the API rewrite of MongoDB without Fibers AND if you are using rawCollection directly you have to review your methods otherwise you will see deprecation messages if you are still using the old mongodb style directly.
    - waitForStepDownOnNonCommandShutdown=false is not needed anymore when spawning the mongodb process
    - _synchronousCursor._dbCursor.operation is not an option anymore in the raw cursor from nodejs mongodb driver. If you want to access the options, use _synchronousCursor._dbCursor.(GETTERS) - for example, _synchronousCursor._dbCursor.readPreference.
    - the default write preference for replica sets on mongo v5 is w:majority
    - If you are using MongoDB inside a Docker container in your dev environment, you might need to append directConnection=true in your mongouri to avoid the new mongo driver Service Discovery feature

* `allow-deny@1.1.1`
    - Handle `MongoBulkWriteError` as `BulkWriteError` was already handled.

* `meteor-tool@2.6.0`
    - Cordova changes to support new Launch Screens.
    - Mongo changes to support new embedded version, 5.0.5.
    - Fix resolving npm deps of local packages when on different drive. [PR](https://github.com/meteor/meteor/pull/11868)

* `minimongo@1.8.0`
    - Changes to keep everything compatible with MongoDB Server 5.x and MongoDB Node.js driver 4.x.

* `npm-mongo@4.3.1`
    - Upgraded MongoDB Node.js driver to 4.3.1

* `tinytest@1.2.1`
    - Custom message support for `throws`

#### Independent Releases

## v2.5.8, 2022-05-31

#### Highlights

* Fixed 2.5.7 MongoDB error
* Patch release to update Node to version 14.19.3 and npm version to 6.14.17.

#### Breaking Changes

- N/A

#### Migration Steps

- N/A

## v2.5.7, 2022-05-31

#### Highlights

* Patch release to update Node and npm versions.

#### Breaking Changes

- N/A

#### Migration Steps

- N/A

#### Meteor Version Release

* `meteor-tool@2.5.7`
    - Patch release to update Node and npm versions.

## v2.5.6, 2022-01-25

#### Highlights

* Go back to using node-fibers mainline dependency instead of a fork. Also ships fibers binaries.

#### Breaking Changes

- N/A

#### Migration Steps

- N/A

#### Meteor Version Release

* `meteor-tool@2.5.6`
    - Go back to using node-fibers mainline dependency instead of a fork. Also ships fibers binaries.

## v2.5.5, 2022-01-18

#### Highlights

* Bump node version to 14.18.3 - security patch
* Change the tar implementation for streams, used on deploying and unpacking packages. Reduced "upload bundle" time when deploying is expected.

#### Breaking Changes

- N/A

#### Migration Steps

- N/A

#### Meteor Version Release

* `meteor-tool@2.5.5`
    - Bump node version to 14.18.3 - security patch
    - Change the tar implementation for streams, used on deploying and unpacking packages. Reduced "upload bundle" time when deploying is expected.

* `accounts-base@2.2.1`
    - Fixes onLogin firing twice. [PR](https://github.com/meteor/meteor/pull/11785) and [Issue](https://github.com/meteor/meteor/issues/10853)

#### Independent Releases

* `oauth@2.1.1`
    - Fixes end of redirect response for oauth inside iframes. [PR](https://github.com/meteor/meteor/pull/11825) and [Issue](https://github.com/meteor/meteor/issues/11817)

## v2.5.4, 2022-01-14

This version should be ignored. Proceed to 2.5.5 above.

## v2.5.3, 2022-01-04

#### Highlights

* Fixes invalid package.json error with `resolve`

#### Breaking Changes

- N/A

#### Migration Steps

- N/A

#### Meteor Version Release

* `meteor-tool@2.5.3`
    - Fixes invalid package.json files breaking Meteor run. [PR](https://github.com/meteor/meteor/pull/11832) and [Issue](https://github.com/meteor/meteor/issues/11830)

#### Independent Releases

## v2.5.2, 2021-12-21

#### Highlights

* Reify performance improvements
* Node.js update to 14.18.2
* HMR Fixes

#### Breaking Changes

* If a module calls `module.hot.decline()`, calling `module.hot.accept()` later now does nothing instead of overriding `module.hot.decline()`.

#### Migration Steps

- N/A

#### Meteor Version Release

* `meteor-tool@2.5.2`
    - Changes @meteorjs/babel and @meteorjs/reify to improve Reify performance.
    - Upgrades Node.js to 14.18.2
    - Fixes isopacket [load failure](https://github.com/meteor/meteor/issues/10930) on Windows. [PR](https://github.com/meteor/meteor/pull/11740)

* `hot-module-replacement@0.5.0`
    - Prevents hot.accept from overriding hot.decline. [PR](https://github.com/meteor/meteor/pull/11801)
    - Fixes falling back to hot code push on web archs. [PR](https://github.com/meteor/meteor/pull/11795)

* `@meteorjs/babel@7.15.0`
    - Updates @meteorjs/reify to improve Reify performance.

* `@meteorjs/reify@0.23.0`
    - Uses `@meteorjs/reify` instead of `reify`
    - Check scope when wrapping to fix slowness in MUI v5. [PR](https://github.com/meteor/reify/pull/1) and [Issue](https://github.com/benjamn/reify/issues/277).

* `standard-minifier-js@2.8.0`
    - Bump to apply improvements from Reify

* `typescript@4.4.1`
    - Bump to apply improvements from Reify

* `babel-compiler@7.8.0`
    - Bump to apply improvements from Reify

* `ecmascript@0.16.1`
    - Bump to apply improvements from Reify

* `modules@0.18.0`
    - Bump to apply improvements from Reify

#### Independent Releases

* `react-fast-refresh@0.2.2`
    - [Fixes](https://github.com/meteor/meteor/issues/11744) bugs. [PR](https://github.com/meteor/meteor/pull/11794/)

* `accounts-ui@1.4.2`
    - Update usage of `accounts-passwordless` to be compatible with 2.0.0.

* `minifier-js@2.7.3`
    - Revert `evaluate` option that was set to false in 2.7.2.

* `standard-minifier-js@2.7.3`
    - Using `minifier-js@2.7.3`


* `npm-mongo@4.2.1`
    - Update MongoDB driver version to 4.2.1

## v2.5.1, 2021-11-17

#### Highlights
- Mac M1 Support - darwin arm64. [Read more](https://blog.meteor.com/).

#### Breaking Changes
- `Meteor.loginWithToken` from the new package `accounts-passwordless` was conflicting with another method with the same name on `accounts-base` so we had to rename the method of `accounts-passwordless` package to `Meteor.passwordlessLoginWithToken`.

#### Meteor Version Release

* `meteor-tool@2.5.1`
    - Meteor supports now Mac M1 chips (darwin arm64)

* `accounts-passwordless@2.0.0`
    - `Meteor.loginWithToken` from the new package `accounts-passwordless` was conflicting with another method with the same name on `accounts-base` so we had to rename the method of `accounts-passwordless` package to `Meteor.passwordlessLoginWithToken`.

#### Independent Releases
* `minifier-js@2.7.2`
    - Stopped using `evaluate` option in the compression to fix a [bug](https://github.com/meteor/meteor/issues/11756).
    - Updated `terser` to [v5.9.0](https://github.com/terser/terser/blob/master/CHANGELOG.md#v590) to fix various bugs

* `standard-minifier-js@2.7.2`
    - Using `minifier-js@2.7.2`

* `github-oauth@1.3.2`
    - Migrate from `http` to `fetch`
    - Fix GitHub login params to adhere to changes in GitHub API

## v2.5, 2021-10-21

#### Highlights

* New package: `accounts-passwordless`
* Cordova Android v10
* HMR now works on all architectures and legacy browsers
* `Accounts.config()` and third-party login services can now be configured from Meteor settings

#### Breaking Changes

* Cordova Android v10 now enables AndroidX. If you use any cordova-plugin that depends or uses any old support library, you need to include the cordova-plugin-androidx-adapter cordova-plugin, otherwise you will get build errors.

#### Meteor Version Release

* CircleCI testing image was updated to include Android 30 and Node 14

* `meteor-tool@2.5`
    - Cordova Android upgraded to v10
    - HMR improvements related to `hot-module-replacement@0.4.0`
    - Fix finding local packages on Windows located on drives other than C
    - Fix infinite loop in import scanner when file is on a different drive than source root
    - Fix Meteor sometimes not detecting changes to a file after the first time it is modified
    - Fixes Meteor sometimes hanging on Windows. Reverts the temporary fix in Meteor 2.4 of disabling native file watchers for some commands
    - Uses recursive file watchers on Windows and macOS. In most situations removes the up to 5 seconds delay before detecting the first change to a file, and is more efficient.
    - Node updated to [v14.18.1](https://nodejs.org/en/blog/release/v14.18.1/), following [October 12th 2021 security release](https://nodejs.org/en/blog/vulnerability/oct-2021-security-releases/)
    - Skeletons had their dependencies updated

* `accounts-passwordless@1.0.0`
    - New accounts package to provide passwordless authentication.

* `accounts-password@2.2.0`
    - Changes to reuse code between passwordless and password packages.

* `accounts-base@2.2.0`
    - You can now apply all the settings for `Accounts.config` in `Meteor.settings.packages.accounts-base`. They will be applied automatically at the start of your app. Given the limitations of `json` format you can only apply configuration that can be applied via types supported by `json` (ie. booleans, strings, numbers, arrays). If you need a function in any of the config options the current approach will still work. The options should have the same name as in `Accounts.config`, [check them out in docs.](https://docs.meteor.com/api/accounts-multi.html#AccountsCommon-config).
    - Changes to reuse code between passwordless and password packages.

* `accounts-ui-unstyled@1.6.0`
    - Add support for `accounts-passwordless`.

* `service-configuration@1.3.0`
    - You can now define services configuration via `Meteor.settings.packages.service-configuration` by adding keys as service names and their objects being the service settings. You will need to refer to the specific service for the settings that are expected, most commonly those will be `secret` and `appId`.

* `autoupdate@1.8.0`
    - Enable HMR for all web arch's

* `ecmascript@0.16.0`
    - Enable HMR for all web arch's

* `hot-module-replacement@0.4.0`
    - Provides polyfills needed by Meteor.absoluteUrl in legacy browsers
    - Improvements for HMR to work in all architectures and legacy browsers

* `module-runtime@0.14.0`
    - Improvements for legacy browsers

* `react-fast-refrest@0.2.0`
    - Enable HMR for all web arch's

* `typescript@4.4.0`
    - Enable HMR for all web arch's

* `webapp@1.13.0`
    - Update `cordova-plugin-meteor-webapp` to v2
    - Removed dependency on `cordova-plugin-whitelist` as it is now included in core
    - Cordova Meteor plugin is now using AndroidX
    - Added new settings option `Meteor.settings.packages.webapp.alwaysReturnContent` that will always return content on requests like `POST`, essentially enabling behavior prior to Meteor 2.3.1.

#### Independent Releases

* `modern-browsers@0.1.6`
    - Added `mobileSafariUI` as an alias for Mobile Safari

* `minifier-js@2.7.1`
    - Updated `terser` to [v5.8.0](https://github.com/terser/terser/blob/master/CHANGELOG.md#v580) to fix various bugs

* `standard-minifier-js@2.7.1`
    - Updated `@babel/runtime` to [v7.15.4](https://github.com/babel/babel/releases/tag/v7.15.4)

* `accounts-ui@1.4.1`
    - Update compatibility range with `less` from 3.0.2 to 4.0.0

* `accounts-ui-unstyled@1.5.1`
    - Update compatibility range with `less` from 3.0.2 to 4.0.0

* `google-config-ui@1.0.3`
    - Deliver siteUrl in the same way as other config-ui packages

* `ecmascript-runtime-client@0.12.1`
    - Revert `core-js` to v3.15.2 due to issues in legacy build with arrays, [see issue for more details](https://github.com/meteor/meteor/issues/11662)

* `modern-browsers@0.1.7`
    - Added `firefoxMobile` as an alias for `firefox`

* `dynamic-import@0.7.2`
    - Fixes 404 in dynamic-import/fetch when ROOT_URL is set with a custom path. [see issue](https://github.com/meteor/meteor/issues/11701)

## v2.4.1, 2021-10-12

#### Meteor Version Release

* `meteor-tool@2.4.1`
    - Patch to make 2.4.1 compatible with Push to Deploy feature in Galaxy (Meteor Cloud)

## v2.4, 2021-09-15

#### Highlights

* Typescript updated to [v4.3.5](https://github.com/Microsoft/TypeScript/releases/tag/v4.3.5)
* Email package now allows setting `Email.customTransport` to override sending method.
* Use `createIndex` instead of `_ensureIndex` to align with new MongoDB naming.
* Apollo skeleton has been upgraded for [Apollo server v3](https://github.com/apollographql/apollo-server/blob/main/CHANGELOG_historical.md#v300)
* `reify` has been updated to v0.22.2 which reduces the overhead of `import` statements and some uses of `export ... from`, especially when a module is imported a large number of times or re-exports a large number of exports from other modules. PRs [1](https://github.com/benjamn/reify/pull/246), [2](https://github.com/benjamn/reify/pull/291)
* Meteor NPM installer is [now available for all platforms](https://github.com/meteor/meteor/pull/11590).
* DDP server now allows you to set publication strategies for your publications to control mergebox behavior
* On Windows Meteor should no longer be hanging on commands

#### Migration steps

1. Replace all usage of `collection._ensureIndex` with `collection.createIndex`. You only need to rename the method as the functionality is the same.
2. If you are using a [well known service](https://nodemailer.com/smtp/well-known/) for the email package switch to using `Meteor.settings.packages.email` settings instead of `MAIL_URL` env variable. Alternatively you can utilize the new `Email.customTransport` function to override the default package behavior and use your own. [Read the email docs](https://docs.meteor.com/api/email.html) for implementation details.

#### Meteor Version Release

* Skeletons dependencies updated

* `meteor-tool@2.4`
    - `meteor show` now reports if a package is deprecated
    - `reify` update to v0.22.2 which bring optimizations for imports. PRs [1](https://github.com/benjamn/reify/pull/246), [2](https://github.com/benjamn/reify/pull/291)
    - Apollo skeleton now uses [Apollo server v3](https://github.com/apollographql/apollo-server/blob/main/CHANGELOG.md#v300) - [migration guide](https://www.apollographql.com/docs/apollo-server/migration/)
    - Upgraded `chalk` to v4.1.1
    - Typescript updated to [v4.3.5](https://github.com/Microsoft/TypeScript/releases/tag/v4.3.5)
    - `METEOR_SETTINGS` is now accepted an all modes
    - Native file watchers are now disabled on Windows for many file-intensive actions (like, `create`, `update`, `build` etc.), this solves an issue with hanging Meteor commands on Windows

* `webapp@1.12`
    - npm dependencies have been updated
    - Added hook to change runtime config delivered to the client app, [read more](https://github.com/meteor/meteor/pull/11506)
    - Added hook to get notified when the app is updated, [read more](https://github.com/meteor/meteor/pull/11607)
    - `@vlasky/whomst@0.1.7`
    - Added `addUpdateNotifyHook` that gets called when runtime configuration is updated

* `logging@1.3.0`
    - Switch from `cli-color` to `chalk` to have the same dependency as meteor-tool
    - Fix detecting eval
    - Copy over code from `Meteor._debug` to `Log.debug` which will be deprecated in the future

* `email@2.2`
    - Modernized package code
    - Add alternative API function that you can hook into to utilize your own sending method: `Email.customTransport`. [Read the docs](https://docs.meteor.com/api/email.html#Email-customTransport)
    - Use `Meteor.settings` for easy setup to sending email via [known providers](https://nodemailer.com/smtp/well-known/). [Read the docs](https://docs.meteor.com/api/email.html)

* `ddp-server@2.5.0`
    - One of three different publication strategies can be selected for any Meteor publication - SERVER_MERGE, NO_MERGE and NO_MERGE_NO_HISTORY. These control the behaviour of the Meteor mergebox, providing a compromise between client-server bandwidth usage and server side memory usage. [See PR](https://github.com/meteor/meteor/pull/11368) or [the documentation](https://docs.meteor.com/api/pubsub.html#Publication-strategies) for more details.

* `mongo@1.13.0`
    - Add `createIndex` as a collection function (in MongoDB since MongoDB v3). This is a new name for `_ensureIndex` which MongoDB has deprecated and removed in MongoDB 5.0. Use of `_ensureIndex` will show a deprecation warning on development.

* `accounts-base@2.1.0`
    - Migrated usage of `_ensureIndex` to `createIndex`

* `accounts-oauth@1.4.0`
    - Migrated usage of `_ensureIndex` to `createIndex`

* `accounts-password@2.1.0`
    - Migrated usage of `_ensureIndex` to `createIndex`

* `oauth@2.1.0`
    - Migrated usage of `_ensureIndex` to `createIndex`

* `oauth1@1.5.0`
    - Migrated usage of `_ensureIndex` to `createIndex`

* `facebook-oauth@1.10.0`
    - Added login handler hook, like in the Google package for easier management in React Native and similar apps. [PR](https://github.com/meteor/meteor/pull/11603)

* `service-configuration@1.5.0`
    - Migrated usage of `_ensureIndex` to `createIndex`

* `ecmascript-runtime-client@0.12.0`
    - `core-js@3.16.0`

* `ecmascript-runtime-server@0.11.0`
    - `core-js@3.16.0`

* `ecmascript-runtime@0.8.0`
    - Version bump to ensure changes from server & client runtime get propagated.

* `tinytest@1.2.0`
    - Add option to temporarily replace `Tinytest.add` or `Tinytest.addAsync` by `Tinytest.only` or `Tinytest.onlyAsync` so only the tests added using `only*` are going to be executed.

* `test-helpers@1.3.0`
    - Support for `Tinytest.only` and `Tinytest.onlyAsync`

* `modules@0.17.0`
    - Update `reify` to `0.22.2`

* `standard-minifier-js@2.7.0`
    - `@babel/runtime@7.15.3`
    - Code modernization
    - Improved error handling

* `minifier-js@2.7.0`
    - Added tests
    - Code modernization

* `standard-minifier-css@1.7.4`
    - `@babel/runtime@7.15.3`

* `minifier-css@1.6.0`
    - Updated dependencies
        - `postcss@8.3.5`
        - `cssnano@4.1.11`

* `callback-hook@1.4.0`
    - Added `forEach` iterator to be more in-line with the ES use for iterations. `each` is now deprecated, but will remain supported.

## v2.3.7, 2021-10-12

#### Meteor Version Release

* `meteor-tool@2.3.7`
    - Patch to make 2.3.7 compatible with Push to Deploy feature in Galaxy (Meteor Cloud)

## v2.3.6, 2021-09-02

#### Highlights

* Updated Node.js per [August 31st security release](https://nodejs.org/en/blog/vulnerability/aug-2021-security-releases2/)

#### Meteor Version Release

* `meteor-tool@2.3.6`
    - Node.js updated to [v14.17.6](https://nodejs.org/en/blog/release/v14.17.6/)

#### Independent Releases

* `minifier-js@2.6.1`
    - Terser updated to [4.8.0](https://github.com/terser/terser/blob/master/CHANGELOG.md#v480)

* `routepolicy@1.1.1`
    - Removed `underscore` dependency since it was not used in the package

* `email@2.1.1`
    - Updated `nodemailer` to v6.6.3

* `callback-hook@1.3.1`
    - Modernized the code
    - Fixed a variable assignment bug in `dontBindEnvironment` function

* `less@4.0.0`
    - Updated `less` to v4.1.1
    - Fixed tests

* `npm-mongo@3.9.1`
    - `mongodb@3.6.10`

* `accounts-base@2.0.1`
    - Create index on `services.password.enroll.when`
    - Blaze weak dependency updated to v2.5.0

* `facebook-oauth@1.9.1`
    - Allow usage of `http` package both v1 and v2 for backward compatibility

* `github-oauth@1.3.1`
    - Allow usage of `http` package both v1 and v2 for backward compatibility

* `google-oauth@1.3.1`
    - Allow usage of `http` package both v1 and v2 for backward compatibility

* `meetup-oauth@1.1.1`
    - Allow usage of `http` package both v1 and v2 for backward compatibility

* `meteor-developer-oauth@1.3.1`
    - Allow usage of `http` package both v1 and v2 for backward compatibility

* `weibo-oauth@1.3.1`
    - Allow usage of `http` package both v1 and v2 for backward compatibility

* `oauth1@1.4.1`
    - Allow usage of `http` package both v1 and v2 for backward compatibility
    - Blaze weak dependency updated to v2.5.0

* `ddp-server@2.4.1`
    - Fix a bug where `testMessageOnConnect` has always been sent

* `accounts-password@2.0.1`
    - Fix use of `isEnroll` in reset password

* `mdg:geolocation@1.3.1`
    - Fixed API to work with Meteor 2.3+

* `mdg:reload-on-resume@1.0.5`
    - Fixed API to work with Meteor 2.3+

## v2.3.5, 2021-08-12

#### Highlights

* Updated Node.js per the [August security release](https://nodejs.org/en/blog/vulnerability/aug-2021-security-releases/)
* Includes same improvements as in Meteor v2.2.3
    - Typescript updated to [v4.3.5](https://github.com/Microsoft/TypeScript/releases/tag/v4.3.5)
    - `@meteorjs/babel@7.12.0`

#### Meteor Version Release

* `meteor-tool@2.3.5`
    - Node.js updated to [v14.17.5](https://nodejs.org/en/blog/release/v14.17.5/)
    - Typescript updated to [v4.3.5](https://github.com/Microsoft/TypeScript/releases/tag/v4.3.5)
    - `@meteorjs/babel@7.12.0`
    - Fix broken source maps in VSCode - [PR](https://github.com/meteor/meteor/pull/11584)

## v2.3.4, 2021-08-03

* Fix an issue in `bare` and `vue` skeletons

## v2.3.3, 2021-08-02

* Security patch of Node.js to [14.17.4](https://nodejs.org/en/blog/release/v14.17.4/)
* App skeletons had the following dependencies updated:
    - `meteor-node-stubs@1.1.0`
    - `@babel/runtime@7.14.8`
* `babel/parser@7.14.9` for server dev bundle

## v2.3.2, 2021-07-13

#### Meteor Version Release

* `meteor-tool@2.3.2`
    - fixes a bug that makes `meteor run android` run with the new aab package flag

## v2.3.1, 2021-07-08

#### Highlights

* Fix windows issue when running webapp package.
* Node.js updated to 14.17.3, following [security release](https://nodejs.org/en/blog/vulnerability/july-2021-security-releases/)

#### Breaking Changes

* Meteor will now generate ".aab" (bundle files) by default when building for Android. This is the [new default format](https://android-developers.googleblog.com/2021/06/the-future-of-android-app-bundles-is.html) for Android apps. Use the new build flag `--packageType=apk` if you still need to generate APK.

#### Meteor Version Release

* Updated travis CI environment to use Node.js 14.17.3

* `meteor-tool@2.3.1`
    - Node.js updated to [14.17.2](https://nodejs.org/en/blog/release/v14.17.2/) and [14.17.3](https://nodejs.org/en/blog/release/v14.17.3/)
    - `@babel/runtime` dependency updated to v7.14.6 across the tool and testing apps
    - Skeletons dependencies updated
    - Apollo skeleton removed `apollo-boost` dependency which is no longer needed
    - New build flag `--packageType` to choose between apk/bundle for android builds (defaults to bundle).

#### Independent Releases

* `webapp@1.11.1`
    - Remove `posix` from npm shrinkwrap, to fix a bug it causes on Windows.

* `less@3.0.2`
    - Updated `@babel/runtime` to v7.14.6
    - Updated `less` to v3.11.3

* `standard-minifiers-css@1.7.3`
    - Updated `@babel/runtime` to v7.14.6

* `standard-minifiers-js@2.6.1`
    - Updated `@babel/runtime` to v7.14.6

* `dynamic-import@0.7.1`
    - Fix [Safari 14 bug](https://bugs.webkit.org/show_bug.cgi?id=226547) with indexedDB

## v2.3, 2021-06-24

#### Highlights

* Node.js update to 14.17.1 from 12.22.1 🎉

* Typescript update to [4.3.2](https://devblogs.microsoft.com/typescript/announcing-typescript-4-3/)

* Packages had their backward compatibility to before Meteor 1.0 removed. See below for more details.

* Improved tracking of which files are used by build plugins to know when it should do a full rebuild, a faster client-only rebuild, or can completely skip rebuilding after a file is modified. This should work with any type of file in any directory, and for both files in the app and files in packages. The most noticeable improvement is when modifying a file only used on the client Meteor will only rebuild the client, even if the file is not inside `imports` or a `client` folder.

### Summary of breaking changes

- As Node.js version was upgraded to a new major version we recommend that you review if your npm dependencies are compatible with Node.js 14.
    - If we receive reports from breaking changes we are going to list them here but so far we are not aware of any.
    - We recommend that you read Node.js [release notes](https://nodejs.org/en/blog/release/v14.0.0/) though.

- Accounts have undergone some major changes including major version bump. See below for more details.

- All official packages that have been deprecated have now the deprecated flag and will inform you about that if you install or update them.

- If you are working with enrollments in user accounts, do note that the enrollment token handling is now separate from reset password token. The token is now under `services.password.enroll`, so adjust your code accordingly if you use it.

### Migration steps

- As Node.js version was upgraded we recommend that you remove your `node_modules` folder (`rm -rf node_modules`) and run `meteor npm i` to be sure you compile all the binary dependencies again using the new Node.js version.
    - Maybe you also want to recreate your lock file.
    - If you get an error try `meteor reset` which will clear caches, beware that this will also remove your local DB for your app.

- If you are maintaining a package that depends on one of the accounts packages which had a major version bump you will either need to set the new version manually or set `api.versionsFrom('2.3')`.
  You can also have it reference its current version and 2.3 like this: `api.versionsFrom(['1.12', '2.3'])`, for specific package it can be like this: `api.use('accounts-base@1.0.1 || 2.0.0')`.

- Old API for packages definitions has been removed. The old underscore method names (e.g. `api.add_files()`) will no longer work, please use the camel case method names (e.g. `api.addFiles()`).

### Breaking changes
* Removed deprecated `mobile-port` flag

* Removed deprecated `raw` name from `isobuild`

* Removed deprecated package API method names `Package.on_use`, `Package.on_test`, `Package._transitional_registerBuildPlugin` and `api.add_files`, if you haven't till now, please use the current camel case versions.

* `accounts-base@2.0.0`
    - Deprecated backward compatibility function `logoutOtherClients` has been removed.

* `accounts-password@2.0.0`
    - Deprecated backward compatibility functionality for `SRP` passwords from pre-Meteor 1.0 days has been removed.
    - Enroll account workflow has been separated from reset password workflow (the enrollment token records are now stored in a separate db field `services.password.enroll`).

* `ddp-client@2.5.0`
    - Removed deprecated backward compatibility method names for Meteor before 1.0

* `ddp-server@2.4.0`
    - Removed deprecated backward compatibility method names for Meteor before 1.0

* `meteor-base@1.5.0`
    - Removed `livedata` dependency which was there for packages build for 0.9.0

* `minimongo@1.7.0`
    - Removed the `rewind` method that was noop for compatibility with Meteor 0.8.1

* `mongo@1.12.0`
    - Removed the `rewind` method that was noop for compatibility with Meteor 0.8.1

* `oauth@2.0.0`
    - Removed deprecated `OAuth.initiateLogin` and other functionality like the addition of `?close` in return URI for deprecated OAuth flow pre Meteor 1.0

* `markdown@2.0.0`
    - Use lazy imports to prevent it from being added to the initial bundle
    - This package is now deprecated

* `http@2.0.0`
    - Internally http has been replaced by [fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), should still work as previous version, but edge cases might be different. This is to aid you in transition to fetch. Note that this means that the `npmRequestOptions` parameter to `HTTP.call` has been removed, as `request` is no longer used internally.

* `socket-stream-client@0.4.0`
    - Remove IE8 checks

#### Meteor Version Release

* `meteor-tool@2.3`
    - Node.js update to 14.17.1 from 12.22.1 🎉
        - This is a major upgrade in Node.js. See the [release notes](https://nodejs.org/en/blog/release/v14.0.0/) for more details.
    - `npm` update to 6.14.13.
    - `fibers` has been updated to v5.0.0.
    - `promise` has been updated to v8.1.0.
    - `node-gyp` has been updated to v8.0.0.
    - `node-pre-gyp` has been updated to v0.15.0.
    - `@babel/runtime` has been updated to v7.14.0.
    - `request` has been updated to v2.88.2.
    - `uuid` has been updated to v3.4.0.
    - `graceful-fs` has been updated to v4.2.6.
    - `tar` has been updated to v2.2.2.
    - `sqlite3` has been updated to v5.0.2.
    - `http-proxy` has been updated to v1.18.1.
    - `wordwrap` has been updated to v1.0.0.
    - `moment` has been updated to v2.29.1.
    - `glob` has been updated to v7.1.6.
    - `split2` has been updated to v3.2.2.
    - `lru-cache` has been updated to v4.1.5.
    - `anser` has been updated to v2.0.1.
    - `xmlbuilder2` has been updated to v1.8.1.
    - `ws` has been updated to v7.4.5.
    - `underscore` has been updated to v1.13.1
    - `optimism` has been updated to v0.16.1
    - `@wry/context` has been update to v0.6.0
    - Reduced time spent by server (re)start in development by adding a cache for Reify. This optimization is on by default in development. Set the new `METEOR_TOOL_ENABLE_REIFY_RUNTIME_CACHE` and `METEOR_REIFY_CACHE_DIR` environment variables to adjust it or turn it on for production [read more in the PR](https://github.com/meteor/meteor/pull/11400).
    - New flag `--platforms` has been added to the `build` command to specify the platform you want to build for. `meteor build . --platforms=android`. This is useful for example when you are not using a MacOS and you want to build your app only for Android. Also to save time on CI not building all the platforms all the time. See [PR](https://github.com/meteor/meteor/pull/11437) for details.
    - The undocumented environment variable `DDP_DEFAULT_CONNECTION_URL` behavior has changed. Setting `DDP_DEFAULT_CONNECTION_URL` when running the server (development: `meteor run` or production: `node main.js`) sets the default DDP server value for meteor.  But this did not work for `cordova` apps.  Now you can define the `cordova` app default DDP server value by setting `DDP_DEFAULT_CONNECTION_URL` when building (`meteor build`).
    - Skeletons dependencies updated to latest version
    - Svelte skeleton now has HMR
    - New deploy option: `--build-only`. Helpful if you want to build first and after some validations proceeding with the upload and deploy. [Read more](https://galaxy-guide.meteor.com/deploy-command-line.html#cache-only)
    - Improved watched system to properly rebuild `client` even when a file is outside of `client` or `imports` folders. See [PR](https://github.com/meteor/meteor/pull/11474) for details.
    - Fix an issue when `App.appendToConfig` crashed Cordova build.
    - Reify compiler now uses cache in runtime. [Read more](https://github.com/meteor/meteor/pull/11400)

* `launch-screen@1.3.0`
    - Removes LaunchScreen from web clients.

* `meteor-babel@7.11.0 (@meteorjs/babel)`
    - Fixes for Samsung Internet v6.2+ to be considered modern browser and addition of [logical assignment operators](https://github.com/tc39/proposal-logical-assignment) via `babel-presets-meteor`.
    - This package was renamed to `@meteorjs/babel`.

* `hot-module-replacement@0.3.0`
    - Fixes various HMR bugs and edge cases see [PR for more](https://github.com/meteor/meteor/pull/11405).

* `email@2.1.0`
    - Updates `nodemailer` to `6.6.0` and it now adds `charset=utf-8` to `text/plain` messages by default.

* `server-render@0.4.0`
    - Updated npm dependencies

* `accounts-base@2.0.0`
    - New hook `setAdditionalFindUserOnExternalLogin` has been added which allows you to customize user selection on external logins if you want to, for example, login a user who has the same e-mail as the external account.

* `ddp-server@2.4.0`
    - Added support for `this.unblock()` in `Meteor.publish()` context. See [PR](https://github.com/meteor/meteor/pull/11392) for more details.
    - Add support in `Meteor.publish()` for async functions

* `webapp@1.11.0`
    - Webapp will respond appropriately to unsupported requests instead of sending content, including handling for new HTTP verbs. See [PR](https://github.com/meteor/meteor/pull/11224) for more details.

#### Independent Releases

* `ddp-server@2.3.3`
    - Updates dependencies which removes Node's HTTP deprecation warning.

* `socket-stream-client@0.3.2`
    - Updates dependencies which removes Node's HTTP deprecation warning.

* `ddp-client@2.4.1`
    - Re-ordering fields in DDP message for better client readability.

* `mongo@1.11.1`
    - Fixes a `Timestamp.ONE is undefined` bug.

* `mongo-id@1.0.8`
    - Removes unused dependency `id-map`.

* `accounts-server@1.7.1`
    - To better test password format & limit password to 256 characters, you can change this limit by setting `Meteor.settings.packages.accounts.passwordMaxLength`.

* `static-html@1.3.1`
    - Removes `underscore` dependency.

* `dev-error-overlay@0.1.1`
    - Fixes sometimes page content being on top of error overlay.

* `id-map@1.1.1`
    - Removes unused dependencies and modernizing the code.

* `http@1.4.4`
    - Used the new deprecation package flag instead of loud console warning.

* `logic-solver@2.0.8`
    - Fixed `package.js` to use current `api` method calls.

* `socket-stream-client@0.3.3`
    - Update `faye-websocket` dependency to v0.11.4.

* `jshint@1.1.8`
    - The package has been deprecated.

* `npm-bcrypt@0.9.4`
    - The package has been deprecated.

* `ecmascript-runtime-client@0.11.1`
    - Updated `core-js` to v3.14.0

* `ecmascript-runtime-server@0.11.1`
    - Updated `core-js` to v3.14.0

* `url@1.3.2`
    - Updated `core-js` to v3.14.0

* `hot-module-replacement@0.2.1`
    - Add missing dependency.

* `observe-sequence@1.0.17`
    - Updated dependencies

* `observe-sequence@1.0.18`
    - When `#each` argument is unsupported it will be shown
    - Moving package under Blaze repository

* `react-fast-refresh@0.1.1`
    - Fixed the package to work in IE11

## v2.2.4, 2021-10-12

#### Meteor Version Release

* `meteor-tool@2.2.4`
    - Patch to make 2.2.4 compatible with Push to Deploy feature in Galaxy (Meteor Cloud)

## v2.2.3, 2021-08-12

#### Highlights

* Security update to Node.js [12.22.5](https://nodejs.org/en/blog/release/v12.22.5/)
* Typescript updated to [v4.3.5](https://github.com/Microsoft/TypeScript/releases/tag/v4.3.5)

#### Meteor Version Release

* `meteor-tool@2.3.3`
    - Updated Node.js to 12.22.5 per [Node security update](https://nodejs.org/en/blog/vulnerability/aug-2021-security-releases/)
    - Typescript updated to [v4.3.5](https://github.com/Microsoft/TypeScript/releases/tag/v4.3.5)
    - `@meteorjs/babel@7.12.0`

* `@meteorjs/babel@7.12.0` && `@meteorjs/babel@7.13.0`
    - Dependencies updated to their latest versions

* `babel-compile@7.7.0`
    - `@meteorjs/babel@7.12.0`

* `ecmascript@0.15.3`
    - Typescript and Babel version bump

* `typescript@4.3.5`
    - [`typescript@4.3.5`](https://github.com/Microsoft/TypeScript/releases/tag/v4.3.5)

## v2.2.2, 2021-08-02

#### Highlights

- Security update to Node.js [12.22.4](https://nodejs.org/en/blog/release/v12.22.4/)

## v2.2.1, 2021-06-02

#### Highlights

- Node.js updated to [12.22.2](https://nodejs.org/en/blog/release/v12.22.2/)
- npm updated to 6.14.13

#### Meteor Version Release

* `meteor-tool@2.2.1`
    - Updated Node.js to 12.22.2 per [Node security update](https://nodejs.org/en/blog/vulnerability/july-2021-security-releases/)

## v2.2, 2021-04-15

#### Highlights

- MongoDB Update to 4.4.4
- Cordova Update to 10
- Typescript Update to 4.2.2
- New skeleton: `meteor create myapp --svelte`

### Breaking changes

* N/A

### Migration steps

* `meteor-tool` maybe you need to install the new Visual C++ Redistributable for Visual Studio 2019 to run MongoDB 4.4.4 on Windows. [read more](https://docs.meteor.com/windows.html)

* `mongo` package is now using useUnifiedTopology as `true` by default otherwise the new driver was producing a warning (see details below). It's important to test your app with this change.

* `cordova` plugins and main libraries were updated from 9 to 10. It's important to test your app with these changes.

* `typescript` was updated to 4.2.2, make sure your read the [breaking changes](https://devblogs.microsoft.com/typescript/announcing-typescript-4-2/#breaking-changes).

#### Meteor Version Release

* `meteor-tool@2.2`
    - Update embedded MongoDB version to 4.4.4 [#11341](https://github.com/meteor/meteor/pull/11341)
        - Maybe you need to install the new Visual C++ Redistributable for Visual Studio 2019 to run on Windows. [read more](https://docs.meteor.com/windows.html)
    - Fix WindowsLikeFilesystem true when release string includes case insensitive word microsoft. [#11321](https://github.com/meteor/meteor/pull/11321)
    - Fix absoluteFilePath on Windows. [#11346](https://github.com/meteor/meteor/pull/11346)
    - New skeleton: `meteor create myapp --svelte`
    - Update Blaze skeleton to use HMR

* `npm-mongo@3.9.0`
    - Update MongoDB driver version to 3.6.6

* `mongo@1.11.0`
    - Using useUnifiedTopology as `true` by default to avoid the warning: `(node:59240) [MONGODB DRIVER] Warning: Current Server Discovery and Monitoring engine is deprecated, and will be removed in a future version. To use the new Server Discover and Monitoring engine, pass option { useUnifiedTopology: true } to the MongoClient constructor. You can still use it as false with `Mongo._connectionOptions` or `Meteor.settings?.packages?.mongo?.options`.

* `cordova@10`
    - Update Cordova to 10.0.0 [#11208](https://github.com/meteor/meteor/pull/11208)

* `typescript@4.2.2`
    - Update Typescript to 4.2.2, make sure your read the [breaking changes](https://devblogs.microsoft.com/typescript/announcing-typescript-4-2/#breaking-changes) [#11329](https://github.com/meteor/meteor/pull/11329)

* `accounts-base@1.9.0`
    - Allow to set token expiration to be set in milliseconds. [#11366](https://github.com/meteor/meteor/pull/11366)

* `facebook-oauth@1.9.0`
    - Upgrade default Facebook API to v10 & allow overriding this value. [#11362](https://github.com/meteor/meteor/pull/11362)

* `minimongo@1.6.2`
    - Add [$mul](https://docs.mongodb.com/manual/reference/operator/update/mul/#up._S_mul) to minimongo. [#11364](https://github.com/meteor/meteor/pull/11364)

* `webapp@1.10.1`
    - Fix for UNIX sockets with node cluster. [#11369](https://github.com/meteor/meteor/pull/11369)


## v2.1.2, 2021-10-12

#### Meteor Version Release

* `meteor-tool@2.1.2`
    - Patch to make 2.1.2 compatible with Push to Deploy feature in Galaxy (Meteor Cloud)

## v2.1.1, 2021-04-06

### Changes

#### Highlights

- Node.js security [update](https://nodejs.org/en/blog/vulnerability/april-2021-security-releases/) to 12.22.1

#### Meteor Version Release

* `meteor-tool@2.1.1`
    - Node.js security [update](https://nodejs.org/en/blog/vulnerability/april-2021-security-releases/) to 12.22.1
    - npm update to 6.14.12

### Breaking changes

* N/A

### Migration steps

* N/A

## v2.1, 2021-02-24

### Changes

#### Highlights

- Node.js security [update](https://nodejs.org/en/blog/vulnerability/february-2021-security-releases/) to 12.21.0

#### Meteor Version Release

* `meteor-tool@2.1`
    - Node.js security [update](https://nodejs.org/en/blog/vulnerability/february-2021-security-releases/) to 12.21.0
    - `meteor create my-app --plan professional` new flag `plan` to enable you to choose a plan from the deploy command.

### Breaking changes

* N/A

### Migration steps

* N/A

## v2.0.1, 2021-10-12

#### Meteor Version Release

* `meteor-tool@2.0.1`
    - Patch to make 2.0.1 compatible with Push to Deploy feature in Galaxy (Meteor Cloud)

## v2.0, 2021-01-20

### Changes

#### Highlights

- Free deploy on [Cloud](https://www.meteor.com/cloud): Deploy for free to Cloud with one command: `meteor deploy myapp.meteorapp.com --free`. ([docs](https://docs.meteor.com/commandline.html#meteordeploy))


- Deploy including MongoDB on [Cloud](https://www.meteor.com/cloud): Deploy including MongoDB in a shared instance for free to Cloud with one command: `meteor deploy myapp.meteorapp.com --free --mongo`. ([docs](https://docs.meteor.com/commandline.html#meteordeploy))


- Hot Module Replacement (HMR): Updates the javascript modules in a running app that were modified during a rebuild. Reduces the feedback cycle while developing so you can view and test changes quicker (it even updates the app before the build has finished). Enabled by adding the `hot-module-replacement` package to an app. React components are automatically updated by default using React Fast Refresh. Integrations with other libraries and view layers can be provided by third party packages. Support for Blaze is coming soon. This first version supports app code in the modern web architecture. ([docs](https://guide.meteor.com/build-tool.html#hot-module-replacement)) [#11117](https://github.com/meteor/meteor/pull/11117)

#### Meteor Version Release

* `meteor-tool@2.0`
    - `meteor create my-app` now creates by default a project using React. If you want to create a new project using Blaze you should use the new option `--blaze`.
        - `meteor create --react my-app` is still going to create a React project.
    - `meteor create --free` deploy for free to Cloud with one command: `meteor deploy myapp.meteorapp.com --free`. ([docs](https://docs.meteor.com/commandline.html#meteordeploy)).
    - `meteor create --free --mongo` deploy including MongoDB in a shared instance for free to Cloud with one command: `meteor deploy myapp.meteorapp.com --free --mongo`. ([docs](https://docs.meteor.com/commandline.html#meteordeploy))
    - `isobuild` fixes a regression on recompiling node modules in different architectures. [#11290](https://github.com/meteor/meteor/pull/11290)
    - `isobuild` converts npm-discards.js to TypeScript. [#10663](https://github.com/meteor/meteor/pull/10663)
    - `cordova` ensures the pathname of the rootUrl is used in the mobile URL. [#11053](hhttps://github.com/meteor/meteor/pull/11053)
    - Add `file.hmrAvailable()` for compiler plugins to check if a file meets the minimum requirements to be updated with HMR [#11117](https://github.com/meteor/meteor/pull/11117)


* `hot-module-replacement@1.0.0`
    - New package that enables Hot Module Replacement for the Meteor app and provides an API to configure how updates are applied. HMR reduces the feedback cycle while developing by updating modified javascript modules within the running application. ([docs](https://docs.meteor.com/packages/hot-module-replacement.html)) [#11117](https://github.com/meteor/meteor/pull/11117)
    - These packages have been updated to support HMR: `autoupdate@1.7.0`, `babel-compiler@7.6.0`, `ddp-client@2.4.0`, `dynamic-import@0.6.0`, `ecmascript@0.15.0`, `modules@0.16.0`, `modules-runtime-hot@0.13.0`, `standard-minifier-css@1.7.2`, `webapp@1.10.0`, `webapp-hashing@1.1.0`


* `react-fast-refresh@0.1.0`
    - New package that updates React components using HMR. This is enabled by default in apps that have HMR enabled and use a supported React version. ([docs](https://atmospherejs.com/meteor/react-fast-refresh)) [#11117](https://github.com/meteor/meteor/pull/11117)


* `dev-error-overlay@0.1.0`
    - New package that allows you to see build errors and server crashes in your browser during development. Requires the app to have HMR enabled. [#11117](https://github.com/meteor/meteor/pull/11117)


* `accounts-base@1.8.0` and `accounts-password@1.7.0`
    - Extra parameters can now be added to reset password, verify e-mail and enroll account links that are generated for account e-mails. By default, these are added as search parameters to the generated url. You can pass them as an object in the appropriate functions. E.g. `Accounts.sendEnrollmentEmail(userId, email, null, extraParams);`. [#11288](https://github.com/meteor/meteor/pull/11288)


* `logging@1.2.0`
    - Updates dependencies and make debug available for use in non production environments. [#11068](https://github.com/meteor/meteor/pull/11068)

#### Independent Releases
* `react-meteor-data@2.2.0`
    - Fix issue with useTracker and Subscriptions when using deps. [#306](https://github.com/meteor/react-packages/pull/306)
    - Remove version constraint on core TypeScript package [#308](https://github.com/meteor/react-packages/pull/308)


* `http`
    - It has been deprecated. [#11068](https://github.com/meteor/meteor/pull/11068)

### Breaking changes

* `http` package has been deprecated. Please start on migrating towards the [fetch](https://atmospherejs.com/meteor/fetch) package instead.

### Migration steps

Simple run `meteor update` in your app.

Great new features and no breaking changes (except one package deprecation). You can always check our [Roadmap](https://docs.meteor.com/roadmap.html) to understand what is next.
