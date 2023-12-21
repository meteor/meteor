# Meteor API

Meteor global object has many functions and properties for handling utilities, network and much more.


### Core APIs {#core}

<ApiBox name="Meteor.startup" hasCustomExample/>

On a server, the function will run as soon as the server process is
finished starting. On a client, the function will run as soon as the DOM
is ready. Code wrapped in `Meteor.startup` always runs after all app
files have loaded, so you should put code here if you want to access
shared variables from other files.

The `startup` callbacks are called in the same order as the calls to
`Meteor.startup` were made.

On a client, `startup` callbacks from packages will be called
first, followed by `<body>` templates from your `.html` files,
followed by your application code.

::: code-group

```js [server.js]
import { Meteor } from "meteor/meteor";
import { LinksCollection } from "/imports/api/links";

Meteor.startup(async () => {
  // If the Links collection is empty, add some data.
  if ((await LinksCollection.find().countAsync()) === 0) {
    await LinksCollection.insertAsync({
      title: "Do the Tutorial",
      url: "https://www.meteor.com/tutorials/react/creating-an-app",
    });
  }
});
```

```js [client.js]
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';
import { App } from '/imports/ui/App';

// Setup react root
Meteor.startup(() => {
  const container = document.getElementById('react-target');
  const root = createRoot(container);
  root.render(<App />);
});

```

:::

<ApiBox name="Meteor.wrapAsync" />
<ApiBox name="Meteor.defer" />
<ApiBox name="Meteor.absoluteUrl" />
<ApiBox name="Meteor.settings" />
<ApiBox name="Meteor.release" />

<ApiBox name="Meteor.isClient" />

<ApiBox name="Meteor.isServer" />

::: danger
`Meteor.isServer` can be used to limit where code runs, but it does not prevent code from
being sent to the client. Any sensitive code that you don’t want served to the client,
such as code containing passwords or authentication mechanisms,
should be kept in the `server` directory.
:::

<ApiBox name="Meteor.isCordova" />
<ApiBox name="Meteor.isDevelopment" />
<ApiBox name="Meteor.isProduction" />
<ApiBox name="Meteor.isModern" />
<ApiBox name="Meteor.isTest" />
<ApiBox name="Meteor.isAppTest" />
<ApiBox name="Meteor.isPackageTest" />

<ApiBox name="Meteor.gitCommitHash" />

### Method APIs {#methods}
