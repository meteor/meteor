---
title: Hot Code Push
description: How to diagnose issues with Hot Code Push in a Meteor Cordova app
---

Is your Meteor Cordova app not getting the updates you’re deploying?

After reading this article, you'll know:

1. The prerequisites to using Hot Code Push
2. Some techniques to diagnose and solve common issues
3. How to dig deeper if that doesn't solve your issue

This article builds on the [Cordova](/cordova.html) article. We recommend reading that first, though we've tried to link back to its relevant sections.

<h2 id="prerequisites">Prerequisites</h2>

Make sure that you have:

- an Android and/or iOS mobile app based on Meteor's [Cordova integration](/cordova.html#cordova-integration-in-meteor)
- the package `hot-code-push` listed in your `.meteor/versions` file
- locally: make sure your test device and development device are [on the same network](/cordova.html#connecting-to-the-server)
- in production: make sure the `--server` flag of your `meteor build` command points to the same place as your `ROOT_URL` environment variable (or, on Galaxy, the *site* in `meteor deploy site`). [See details](/cordova.html#configuring-server-for-hot-code-push)

<h2 id="known-issues">Known issues</h2>

<h3 id="override-compatability-versions">Override compatability versions</h3>

Did the app suddenly stop getting new code after you updated meteor, or you changed plugins?

The client probably logs: `Skipping downloading new version because the Cordova platform version or plugin versions have changed and are potentially incompatible`

Meteor, Cordova and plugins cannot be updated through Hot Code Push. So Meteor by default disables Hot Code Push to app versions that have different versions than the server. This avoids crashing a user’s app, for example, when new JS calls a plugin that his app version doesn’t yet have.

You can [override this behavior](/cordova.html#controlling-compatibility-version). Just make sure you deal with potentially incompatible versions in your JS instead.

<h3 id="set-autoupdate-version">Update your AUTOUPDATE_VERSION</h3>

`AUTOUPDATE_VERSION` is an environment variable you can add to your `run` and `deploy` [commands](https://docs.meteor.com/commandline.html):

```sh
$ AUTOUPDATE_VERSION=abc meteor deploy example.com
```

If your app has an `AUTOUPDATE_VERSION` set, make sure you change its value when you want a deploy to update your clients.

<h3 id="no-soft-update-in-cordova">Cordova doesn’t hot reload CSS separately</h3>

Are you seeing your web app incorporate changes without reload, yet your cordova app reloads each time?

For CSS-only changes, this is the expected behaviour. Browsers update the layout without reload, but in cordova, [any change reloads the whole app](https://docs.meteor.com/packages/autoupdate.html#Cordova-Client).

In case you want to implement soft CSS update for Cordova, see below [how to edit the source](#how-to-edit-the-source).

<h3 id="custom-code-and-packages">Outdated custom reload code and packages</h3>

There are [several reload packages](https://atmospherejs.com/?q=reload), and maybe your app includes some custom reload code. Of course, these may have bugs or be outdated.

In particular, when you push an update, does the app reload but use the old code anyways? Probably, the code hasn't been updated to work with Meteor 1.8.1 or later. As mentioned in the [changelog](https://docs.meteor.com/changelog.html#v18120190403), we recommend you call `WebAppLocalServer.switchToPendingVersion` before forcing a browser reload.

Alternatively, use the built-in behavior to reload. Instead of, say, `window.location.reload()`, call the `retry` function passed to the `Reload._onMigrate()` callback. For example:

```js
Reload._onMigrate((retry) => {
  if (/* not ready */) {
    window.setTimeout(retry, 5 * 1000); // Check again in 5 seconds
    return [false];
  }
  // ready
  return [true];
});
```

If you use a package that is no longer compatible, consider forking it or opening a PR with the above changes. Alternatively, you can switch to a compatible one such as [`quave:reloader`](https://github.com/quavedev/reloader)

<h3 id="avoid-hash-fragments">Avoid hash fragments</h3>

Cordova doesn’t show the URL bar, but the user is still on some URL or other, which may have a hash (`#`). HCP [works better if it doesn't](https://github.com/meteor/meteor/blob/devel/packages/reload/reload.js#L224).

If you can, remove the hash fragment before the reload.

<h3 id="avoid-big-files">Avoid making it download big files</h3>

In the [client side logs](/cordova.html#logging-and-remote-debugging), you may see HCP fail with errors like:

```
Error: Error downloading asset: /
  at http://localhost:12472/plugins/cordova-plugin-meteor-webapp/www/webapp-local-server.js:51:21
  at Object.callbackFromNative (http://localhost:12472/cordova.js:287:58)
  at <anonymous>:1:9
```

This error from [cordova-plugin-meteor-webapp](https://github.com/meteor/cordova-plugin-meteor-webapp) may be caused by big files, often in the `public` folder. Downloading these can fail depending on connection speed, and available space on the device.

You could run `$ du -a public | sort -n -r | head -n 20` to find the 20 biggest files and their sizes. Consider serving them from an external storage service or CDN instead. Then they are only downloaded when really needed, and can fail downloading without blocking HCP.

<h3 id="locally">If it is only broken locally</h3>

If you notice HCP works in production but not when you test locally, you may need to enable clear text or set a correct `--mobile-server`. Both are [explained in the docs](https://docs.meteor.com/packages/autoupdate.html#Cordova-Client).

<h2 id="dig-deeper">Still having issues?</h2>

If none of that solved your issues and you’d like to dive deeper, here’s some tips to get you started.

If you end up finding a bug in one of Meteor's packages or plugins, don't hesitate to open an [issue](https://github.com/meteor/meteor/issues) and/or a [pull request](https://github.com/meteor/meteor/pulls).

<h3 id="where-does-it-live">Where does hot code push live?</h3>

Hot code push is included in `meteor-base` through a web of [official meteor packages](https://github.com/meteor/meteor/tree/devel/packages), most importantly [`reload`](https://github.com/meteor/meteor/tree/devel/packages/reload) and [`autoupdate`](https://github.com/meteor/meteor/tree/devel/packages/autoupdate).

In the case of cordova, a lot of the heavy lifting is done by [`cordova-plugin-meteor-webapp`](https://github.com/meteor/cordova-plugin-meteor-webapp).

To oversimplify, `autoupdate` decides *when* to refresh the client, the plugin then downloads the new client code and assets, and `reload` then refreshes the page to start using them.

<h3 id="what-are-the-steps">What are the steps it takes?</h3>

We can break it down a bit more:

- whenever the server thinks the client side may have changed, it calculates a hash of your entire client bundle
- it [publishes](https://docs.meteor.com/api/pubsub.html) this hash to all clients
- the clients subscribe to this publish
- when a new hash arrives, each client compares it to its own hash
- if it’s different, it starts to download the new client bundle
- when it’s done, the client saves any data and announces that it will reload
- the app and packages get a chance to [save their data or to deny the reload](https://forums.meteor.com/t/is-there-an-official-documentation-of-reload--onmigrate/16974/2)
- if/when allowed, it reloads

<h3 id="how-to-inspect">How to spy on it?</h3>

To figure out where the issue is, we can log the various steps HCP takes.

First, make sure you can [see client-side logs](/cordova.html#logging-and-remote-debugging) (or print them on some screen of your app).

A few more useful values to print, and events to listen to, might be:

- The version hashes: `__meteor_runtime_config__.autoupdate.versions['web.cordova']`

- The reactive [`Autoupdate.newClientAvailable()`](https://github.com/meteor/meteor/blob/devel/packages/autoupdate/QA.md#autoupdatenewclientavailable): if this turns into `true` and then doesn’t refresh, you know the client does receive the new version but something goes wrong trying to download or apply it.

```js
Tracker.autorun(() => {
  console.log(‘new client available:’, Autoupdate.newClientAvailable());
});
```

- To check the client’s subscription to the new versions, check `Meteor.default_connection._subscriptions`. For example, to log whether the subscription is `ready` and `inactive` (using lodash):

```js
const { ready, inactive } = _.chain(Meteor)
  .get('default_connection._subscriptions', {})
  .toPairs()
  .map(1)
  .find({ name: 'meteor_autoupdate_clientVersions' })
  .pick(['inactive', 'ready']) // comment this to see all options
  .value();
console.log(‘ready:’, ready);
console.log(‘inactive:’, inactive);
```
Or, to log the value of `ready` each time the subscription changes:

```js
const hcpSub = _.chain(Meteor)
  .get('default_connection._subscriptions', {})
  .toPairs()
  .map(1)
  .find({ name: 'meteor_autoupdate_clientVersions' })
  .value(); // no .pick() this time; return whole subscription object

Tracker.autorun(() => {
  hcpSub.readyDeps.depend(); // Rerun when something changes in the subscription
  console.log('hcpSub.ready', hcpSub.ready);
});
```
Should print `false` and then `true` less than a second later.

- To see if we finish downloading and preparing the new version, listen to `WebAppLocalServer.onNewVersionReady`;

```js
WebAppLocalServer.onNewVersionReady(() => {
  console.log('new version is ready!');
  // Copied from original in autoupdate/autoupdate_cordova.js because we overwrite it
  if (Package.reload) {
    Package.reload.Reload._reload();
  }
});
```

- To see if permission to reload is being requested, listen to `Reload._onMigrate()`. Be sure to return `[true]` or the reload may not happen. (I believe that if this is run in your app code, it means all packages allowed the reload. But I didn’t find my source on this.)

```js
Reload._onMigrate(() => {
  console.log('going to reload now');
  return [true];
});
```

- To know if a run of `Meteor.startup` was the result of a HCP reload or not, we can take advantage of the fact that `Session`s (like `ReactiveDict`s) are preserved.

```js
Meteor.startup(() => {
  console.log('Was HCP:', Session.get('wasHCP'));
  Session.set('wasHCP', false);

  Reload._onMigrate(() => {
    Session.set('wasHCP', true);
    return [true];
  });
});
```

<h2 id="how-to-edit-source">How to edit the source</h2>

Finally, if you want to change some of the package and plugin code locally, you can.

<h3 id="editing-packages">Editing the packages</h3>

Say we want to edit the `autoupdate` package.

In the root of your project, create a folder named `packages`, then add a folder `autoupdate`. Here we put the code from the original package (found in `~/.meteor/packages`), then we edit it.

Meteor will now use the local version instead of the official one.

<h3 id="editing-plugins">Editing the plugin</h3>

To install a modified version of a plugin,

- from another folder, download the original code e.g. `git clone https://github.com/meteor/cordova-plugin-meteor-webapp.git`
- install it into your meteor project with [`meteor add cordova:cordova-plugin-meteor-webapp@file://path/to/cordova-plugin-meteor-webapp`](https://stackoverflow.com/a/35941588/5786714)
- modify it as you like

Meteor will start using the local version instead of the official one. But note you will have to rerun `meteor build` or `meteor run` every time you change the plugin.

<h2 id="file-issue">Found a bug?</h2>

If you found a bug in one of the packages or plugins, don't hesitate to open an [issue](https://github.com/meteor/meteor/issues) and/or [pull request](https://github.com/meteor/meteor/pulls).


