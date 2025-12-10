# Changelog
## 1.11.3 - 2023-08-XX
### Changes
- Updated default version of Facebook GraphAPI to v17

## 1.11.2 - 2022-12-07
### Changes
- Updated internal code to use new Meteor async format from Meteor 2.9

## 1.11.1 - 2022-11-14
### Changes
- Updated default version of Facebook GraphAPI to v15

## 1.11.0 - 2022-03-24
### Changes
- Updated default version of Facebook GraphAPI to v12

## 1.10.0 - 2021-09-14
### Changes
- Added login handler hook, like in the Google package for easier management in React Native and similar apps. [PR](https://github.com/meteor/meteor/pull/11603)

## 1.9.1 - 2021-08-12
### Changes
- Allow usage of `http` package both v1 and v2 for backward compatibility

## 1.9.0 - 2021-06-24
### Changes
- Upgrade default Facebook API to v10 [#11362](https://github.com/meteor/meteor/pull/11362)

## 1.8.0 - 2021-04-15
### Changes
- You can now override the default API version by setting `Meteor.settings.public.packages.facebook-oauth.apiVersion` to for example `8.0` 

## 1.7.3 - 2020-10-05
### Breaking changes
- N/A

### Changes
- Updated to `1.8` now using Facebook GraphAPI v8.

## 1.7.2 - 2020-09-30
### Breaking changes
- N/A

### Changes
- Supports a new way to call the token from Facebook using a URL that is different from the ROOT_URL. With `overrideRootUrlFromStateRedirectUrl` as `true` in the settings (`packages.facebook-oauth.overrideRootUrlFromStateRedirectUrl`) we are going to use the redirect URL provided in the initial call. So the redirect URL will be used again in the server to get the token, this information will come from the state. This is important to authenticate using Facebook using different domains in the same server.

## 1.7.1 - 2020-09-29
### Breaking changes
- N/A

### Changes
- Supports `params` and `absoluteUrlOptions` as options and pass along to `OAuth._redirectUri`, this is important to authenticate using Facebook using different domains in the same server.
