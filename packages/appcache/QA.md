# QA Notes

## Viewing the app cache

Chrome: Navigate to chrome://appcache-internals/

Firefox: Open Tools / Advanced / Network.  The section reading "The
following websites are allowed to store data for offline use" will
show the amount of data in the app cache ("1.2 MB").  If this number
is 0 the app is permitted to use the app cache but the app cache is
currently turned off.


## Setup

Create a simple static app and add the appcache package.

static.html:

````
<body>
  some static content
</body>
````

If you're testing with Firefox, enable it:

static.js:

````
if (Meteor.isServer) {
  Meteor.AppCache.config({
    firefox: true
  });
}
````


## App is cached offline

Run Meteor, load the app in the browser, stop Meteor.  Reload the page
in the browser and observe the content is still visible.


## Hot code reload still works

Run Meteor, open the app in the browser.  Make a change to
static.html.  Observe the change appear in the web page.

Note that it is normal when using the app cache for the page reload to
be delayed a bit while the browser fetches the changed code in the
background.

Without app cache: (page goes blank) -> (browser fetches) -> (page renders)

With app cache: (browser fetches) -> (page goes blank) -> (page renders)


## Enabling / disabling the appcache turns the app cache on / off

Run Meteor, open the app in the browser.

Disable your browser in the appcache config.  For example, if you're
using Chrome:

````
if (Meteor.isServer) {
  Meteor.AppCache.config({
    chrome: false
  });
}
````

Observe following the hot code reload the app is no longer cached.

Enable your browser again:

````
if (Meteor.isServer) {
  Meteor.AppCache.config({
    chrome: true
  });
}
````

Observe following the hot code reload the app is cached again.


## Removing the appcache package turns off app caching

Start Meteor, open the app in the browser.

Stop Meteor, remove the appcache package, remove or comment out the
call to Meteor.AppCache.config in static.js, start Meteor again.

Wait for the browser to reestablish its livedata connection.  Observe
following the hot code reload that the app is no longer cached.
