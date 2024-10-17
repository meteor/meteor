## Changelog

## 3.0.0
### Breaking changes
- Meteor v3 compatibility

## 2.0.0
### Breaking changes
- Removed compatibility code for before Meteor v1

## 1.3.2 - 2020-09-30
### Breaking changes
- N/A

### Changes
- Supports `setRedirectUrlWhenLoginStyleIsPopup` option in the settings (`public.packages.oauth.setRedirectUrlWhenLoginStyleIsPopup`) to use `redirectUrl` also in the `popup` loginStyle.


## 1.3.1 - 2020-09-29
### Breaking changes
- N/A

### Changes
- Supports `disableCheckRedirectUrlOrigin` option in the settings (`packages.oauth.disableCheckRedirectUrlOrigin`) to avoid calling `OAuth._checkRedirectUrlOrigin`, this is important to authenticate using different domains in the same server.
