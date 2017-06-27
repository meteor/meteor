# server-render
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/server-render) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/server-render)
***

This package implements generic support for server-side rendering in
Meteor apps, by providing a mechanism for injecting strings of HTML into
static HTML in the body of HTTP responses.

### Usage

This package exports a function named `renderIntoElementById` which takes
an HTML `id` string and a callback function.

The callback should return a string of HTML, or a `Promise<string>` if it
needs to do any asynchronous rendering work.

If an element with the given `id` exists in the initial HTTP response body,
the final result of the callback will be injected into that element as
part of the initial HTTP response.

The callback receives the current `request` object as a parameter, so it can
render according to per-request information like `request.url`.

The final result of the callback will be ignored if it is anything other
than a string, or if there is no element with the given `id` in the body of
the current response.

Registering multiple callbacks for the same `id` is not well defined, so
this function just returns any previously registered callback, in case the
new callback needs to do something with it.

Because the `renderIntoElementById` function is not automatically imported
into other packages, you must import it explicitly:

```js
import { renderIntoElementById } from "meteor/server-render";
```
