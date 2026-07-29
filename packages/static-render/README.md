# static-render

Pre-render Blaze routes as HTML on the server, for SEO and social link previews. Supports two modes:

- **SSG** (Static Site Generation): rendered once at server startup, cached permanently
- **SSR** (Server-Side Rendering): rendered at each request with fresh data from MongoDB

Pre-rendered HTML is injected into the Meteor boilerplate via `req.dynamicBody` and `req.dynamicHead`, so your client-side app still loads and takes over normally.

## Usage

```js
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

// SSG — rendered once at startup, cached
FlowRouter.route('/about', {
  static: 'ssg',
  template: 'about',
  staticData() {
    return { title: 'About Us' };
  },
  staticHead() {
    return '<title>About | MyShop</title>';
  },
});

// SSR — rendered at each request with fresh MongoDB data
FlowRouter.route('/products/:slug', {
  static: 'ssr',
  template: 'productPage',
  async staticData(params) {
    return await Products.findOneAsync({ slug: params.slug });
  },
  async staticHead(params) {
    const p = await Products.findOneAsync({ slug: params.slug });
    return `<title>${p.title} — $${p.price}</title>`;
  },
});
```

Templates must be imported from `server/main.js`:

```js
import '../imports/ui/templates.html';
import '../lib/routes.js';
```

Client-side cleanup (remove pre-rendered content when Blaze takes over):

```js
Meteor.startup(() => {
  document.querySelectorAll('[data-static-render]').forEach(el => el.remove());
});
```

See the [full documentation](https://v3-docs.meteor.com/packages/static-render) for the complete API, template restrictions, and integration details.

## Prerequisites

- Meteor 3.4+
- Blaze 3.1.x+ (for server-side template availability)
- `ostrio:flow-router-extra` — **required**. Routes are discovered from the FlowRouter
  route table; without it StaticRender registers no routes and renders nothing. The
  dependency is declared weak so adding this package never pulls a router into an app
  that does not use one. For router-free setups, call `Blaze.toHTML()` directly.
