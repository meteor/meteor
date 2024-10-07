# Modern-browsers


API for defining the boundary between modern and legacy JavaScript clients.

You can use this package to define the minimum browser versions for which
a browser engine will be considered modern. All browsers that do not meet
the threshold will receive the legacy bundle. This way you can easily keep
on using modern features that you need.

You can read more about this in [Meteor 1.7 announcement blog](https://blog.meteor.com/meteor-1-7-and-the-evergreen-dream-a8c1270b0901).

<ApiBox name="ModernBrowsers.isModern" />

<ApiBox name="ModernBrowsers.setMinimumBrowserVersions" />

<ApiBox name="ModernBrowsers.getMinimumBrowserVersions" />

<ApiBox name="ModernBrowsers.calculateHashOfMinimumVersions" />
