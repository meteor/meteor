# Modern-browsers

API for defining the boundary between modern and legacy JavaScript clients.

You can use this package to define the minimum browser versions for which
a browser engine will be considered modern. All browsers that do not meet
the threshold will receive the legacy bundle. This way you can easily keep
on using modern features that you need.

You can read more about this in [Meteor 1.7 announcement blog](https://blog.meteor.com/meteor-1-7-and-the-evergreen-dream-a8c1270b0901).

<ApiBox name="ModernBrowsers.isModern" isDefaultImport/>

<ApiBox name="ModernBrowsers.setMinimumBrowserVersions" isDefaultImport/>

<ApiBox name="ModernBrowsers.getMinimumBrowserVersions" isDefaultImport/>

<ApiBox name="ModernBrowsers.calculateHashOfMinimumVersions" isDefaultImport/>

## Configure Unknown Browsers to default to Modern

Browsers not explicitly listed in `setMinimumBrowserVersions` are considered "legacy" by default.

To change this and treat unknown browsers as "modern," update the relevant option in your settings file:

```js
Meteor.settings.packages = {
  "modern-browsers": {
    unknownBrowsersAssumedModern: true,
  },
};
```
