Launch Screen package
===

A mobile-only package that provides an API for postponing when your
app's launch screen is removed and your app is made visible. For
example, your app can avoid showing the user a white page while first
rendering the UI.

### Simple usage

```js
// just add the package, no special configuration required
```

When this package is added, the app will hold the launch screen until
the `body` template is rendered. If you're using iron:router in your
app, it waits until the first route is rendered.

You can also control it manually if you want to wait on other UI
elements to be loaded before releasing the launch screen and showing
the user the actual app.

### Additional waiting before releasing the launch screen

To wait on more events before releasing the launch screen, call `var handle =
LaunchScreen.hold()` in the top-level of the client code of your app, and when
you're ready to show the launch screen, call `handle.release()`.

For example, to wait for a template to be rendered:

```javascript
// in a client-only javascript file
var handle = LaunchScreen.hold();

Template.myUI.onRendered(function () {
  handle.release();
});
```

Your app, or packages used in your app, can call `LaunchScreen.hold()`
multiple times. The launch screen will be removed once `release` has been
called on all of the handles.
