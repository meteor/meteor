# Changelog
## 1.8.0 - unreleased
### Breaking changes
- N/A

### Changes
- Updated to use Facebook GraphAPI v10
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
