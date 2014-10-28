# mobile-status-bar

This package allows you to customize the status bar on Meteor
Phonegap/Cordova apps.

Right now it just exposes the standard `org.apache.cordova.statusbar` plugin for
Phonegap/Cordova with some defaults. For the extensive documentation see the
original [plugin
repo](https://github.com/apache/cordova-plugin-statusbar/blob/master/doc/index.md).

You can set status bar preferences in your [`mobile-config.js` file](http://docs.meteor.com/#mobileconfigjs) like this:

```
App.setPreference('StatusBarOverlaysWebView', 'false');
App.setPreference('StatusBarBackgroundColor', '#000000');
```