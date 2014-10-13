Launch Screen package
===

A mobile-only package that provides an API for controlling the launch screen
users see when the app is booting app.

It is used only to avoid showing the user a white page slowly building up the UI
elements. Not to hide the whole process of retrieving data. For the best user
experience don't hold the launch screen for too long.

###Simple usage

```
// just add the package, no special configuration required
```

When this package is added, the app will hold the launch screen until the
`body` template is fully loaded on the screen or, in case you use the IronRouter
package, unless first route is rendered.

You can also control it manually if you want to wait on other UI elements to be
loaded before releasing the launch screen and showing the user the actual app.

###Manually adding more actions to await before releasing the launch screen

To tell the package that there is another action you want to be awaited on
startup, declare it by holding the screen in the top-level code once per action
and the release it when the action is completed.

The example awaiting for a template to be rendered is shown below.

```javascript
// declare that there is a new block to hold
if (Meteor.isClient)
  LaunchScreen.hold();

Template.myUI.rendered = function () {
  LaunchScreen.release();
};
```

