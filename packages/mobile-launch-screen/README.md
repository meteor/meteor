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
`body` template or `__IronDefaultLayout__` template (in case you use IronRouter)
is fully loaded on the screen.

You can also control it manually if you want to wait on other UI elements to be
loaded before releasing the launch screen and showing the user the actual app.


###Manually specifying the template

```javascript
// release the launch screen the first time appMainSection is rendered
LaunchScreen.startingTemplate = 'appMainSection';
```

###Manually release the launch screen

```javascript
LaunchScreen.controlManually = true;

// ... later ...
LaunchScreen.hide();
```

###Show launch screen back

```javascript
LaunchScreen.show();
```


