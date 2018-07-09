---
title: webapp
description: Documentation of Meteor's `webapp` package.
---

The `webapp` package is what lets your Meteor app serve content to a web
browser. It is included in the `meteor-base` set of packages that is
automatically added when you run `meteor create`. You can easily build a
Meteor app without it - for example if you wanted to make a command-line
tool that still used the Meteor package system and DDP.

This package also allows you to add handlers for HTTP requests.
This lets other services access your app's data through an HTTP API, allowing
it to easily interoperate with tools and frameworks that don't yet support DDP.

`webapp` exposes the [connect](https://github.com/senchalabs/connect) API for
handling requests through `WebApp.connectHandlers`.
Here's an example that will let you handle a specific URL:

```js
// Listen to incoming HTTP requests (can only be used on the server).
WebApp.connectHandlers.use('/hello', (req, res, next) => {
  res.writeHead(200);
  res.end(`Hello world from: ${Meteor.release}`);
});
```

`WebApp.connectHandlers.use([path], handler)` has two arguments:

**path** - an optional path field.
This handler will only be called on paths that match

this string. The match has to border on a `/` or a `.`. For example, `/hello`
will match `/hello/world` and `/hello.world`, but not `/hello_world`.

**handler** - this is a function that takes three arguments:

- **req** - a Node.js
[IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
object with some extra properties. This argument can be used to get information
about the incoming request.
- **res** - a Node.js
[ServerResponse](http://nodejs.org/api/http.html#http_class_http_serverresponse)
object. Use this to write data that should be sent in response to the
request, and call `res.end()` when you are done.
- **next** - a function. Calling this function will pass on the handling of
this request to the next relevant handler.

### Serving a Static Landing Page

One of the really cool things you can do with WebApp is serve static HTML for a landing page where TTFB (time to first byte) is of utmost importance.

The [Bundle Visualizer](https://docs.meteor.com/packages/bundle-visualizer.html) and [Dynamic Imports](https://docs.meteor.com/packages/dynamic-import.html) are great tools to help you minimize initial page load times. But sometimes you just need to skinny down your initial page load to bare metal.

The good news is that WebApp makes this is really easy to do.

Step one is to create a your static HTML file and place it in the _private_ folder at the root of your application.

Here's a sample _index.html_ you might use to get started:

```
<head>
    <title>Fast Landing Page</title>
    <meta charset="utf-8" />
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0 user-scalable=no" />   
    <link rel="stylesheet" href="path to your style sheet etc">
</head>

    <body>
        <!-- your content -->
    </body>

    <script>

    // any functions you need to support your landing page
 
    </script>

</html>
```

Then using the connectHandlers method described above serve up your static HTML on app-root/ page load as shown below.

```
/* global WebApp Assets */
import crypto from 'crypto'
import connectRoute from 'connect-route'

WebApp.connectHandlers.use(connectRoute(function (router) {
    router.get('/', function (req, res, next) {
        const buf = Assets.getText('index.html')

        if (buf.length > 0) {
            const eTag = crypto.createHash('md5').update(buf).digest('hex')

            if (req.headers['if-none-match'] === eTag) {
                res.writeHead(304, 'Not Modified')
                return res.end()
            }

            res.writeHead(200, {
                ETag: eTag,
                'Content-Type': 'text/html'
            })

            return res.end(buf);
        }

        return res.end('<html><body>Index page not found!</body></html>')
    })
}))
```

There are a couple things to think about with this approach.

We're reading the contents of index.html using the [Assets](https://docs.meteor.com/api/assets.html) module that makes it really easy to read files out of the _private_ root folder.

We're using the [connect-route](https://www.npmjs.com/package/connect-route) NPM package to simplify WebApp route processing. But you can any package you want to understand what is being requested.

And finally, if you decide to use this technique you'll want to make sure you understand how conflicting client side routing will affect user experience.
