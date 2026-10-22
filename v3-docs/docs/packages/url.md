# URL

`url` package provides polyfill for the [WHATWG url specification](https://url.spec.whatwg.org/) for legacy browsers or defaults to the global class which is available in modern browsers and Node. It is recommended that you use this package for compatibility with non-modern browsers.

For more information we recommend [reading the MDN articles](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) about it and looking over the [Node API documentation](https://nodejs.org/api/url.html#url_the_whatwg_url_api) for more details as this article covers only basic usage in Meteor.

## Usage

### Installation

To add this package to an existing app, run the following command from
your app directory:

```bash
meteor add url
```

To add the `url` package to an existing package, include the
statement `api.use('url');` in the `Package.onUse` callback in your
`package.js` file:

```js
Package.onUse((api) => {
  api.use("url");
});
```

After installing the package you can then import the `URL` and `URLSearchParams` from the package and use it as described at MDN and Node documentations.

### URL

```js
import { URL } from "meteor/url";

const url = new URL("https://www.meteor.com");
```

You can then use `URL` for example in a [fetch](/packages/fetch) call:

```js
import { URL } from 'meteor/url';
import { fetch } from 'meteor/fetch';

const url = new URL('https://www.example.com/api/reportVisit');

fetch(url, {
    method: 'POST',
    body: JSON.stringify({ siteId: 11 })
    ...
})

```

### URLSearchParams

```js
import { URLSearchParams } from "meteor/url";

const searchParams = new URLSearchParams({ query: "WHATWG", location: "MDN" });
```

You can then include `URLSearchParams` in the options for `URL` if you build them separately from when creating the `URL` class.
