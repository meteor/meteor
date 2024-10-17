---
title: Assets
description: Documentation of how to use assets in Meteor.
---

> Currently, it is not possible to import `Assets` as an ES6 module.  Any of the `Assets` methods below can simply be called directly in any Meteor server code.

`Assets` allows server code in a Meteor application to access static server
assets, which are located in the `private` subdirectory of an application's
tree. Assets are not processed as source files and are copied directly
into your application's bundle.

{% apibox "Assets.getTextAsync" %}
{% apibox "Assets.getBinaryAsync" %}
{% apibox "Assets.absoluteFilePath" %}

Static server assets are included by placing them in the application's `private`
subdirectory. For example, if an application's `private` subdirectory includes a
directory called `nested` with a file called `data.txt` inside it, then server
code can read `data.txt` by running:

```js
const data = await Assets.getTextAsync('nested/data.txt');
```

Note: Packages can only access their own assets. If you need to read the assets of a different package, or of the enclosing app, you need to get a reference to that package's `Assets` object.
