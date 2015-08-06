# static-html

Essentially, an alternative to the `templating` package that doesn't compile Blaze templates. Mostly useful if you want to use Angular or React as your view layer and just want to get some static HTML content on your page as a render target for your view framework.

This build plugin parses all of the `.html` files in your app and looks for top-level tags:

- `<head>` - appended to the `head` section of your HTML
- `<body>` - appended to the `body` section of your HTML

Attributes are supported on the `<body>` tag, but not on `<head>`.
