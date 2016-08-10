# templating
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/templating) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/templating)
***

Compiles Blaze templates defined in `.html` files. Also automatically includes Blaze on the client.

This build plugin parses all of the HTML files in your app and looks for three top-level tags:

- `<head>` - appended to the `head` section of your HTML
- `<body>` - appended to the `body` section of your HTML
- `<template name="templateName">` - compiled into a Blaze template, which can be included with `{{> templateName}} or referenced in JS code with `Template.templateName`.

For more details, see the [Meteor docs about
templating](http://docs.meteor.com/#/full/livehtmltemplates) and the Blaze
[project page](https://www.meteor.com/blaze).
