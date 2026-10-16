---
title: static-render
description: Pre-render Blaze routes as HTML for SEO — SSG and SSR modes.
---

# static-render

Pre-render Blaze routes as HTML on the server, for SEO and social link previews. Supports two modes:

- **SSG** (Static Site Generation): rendered once at server startup, kept in memory until invalidated, regenerated, or the process restarts
- **SSR** (Server-Side Rendering): rendered at each request with fresh data from MongoDB

Pre-rendered HTML is injected into the Meteor boilerplate via `req.dynamicBody` and `req.dynamicHead`, so your client-side app still loads and takes over normally.

## Prerequisites

- Meteor 3.4+
- Blaze 3.1.x+ (for server-side template availability)
- `ostrio:flow-router-extra` — **required**. Routes are discovered from the FlowRouter
  route table; without it StaticRender registers no routes and renders nothing. The
  dependency is declared weak so adding this package never pulls a router into an app
  that does not use one. For router-free setups, call `Blaze.toHTML()` directly.

## Installation

```bash
meteor add static-render
```

Templates must be imported from `server/main.js`:

```js
// server/main.js
import '../imports/ui/templates.html';
import '../lib/routes.js';
```

## Basic usage — SSG

For pages that don't change without a server restart (about, contact, terms):

```js
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';

FlowRouter.route('/about', {
  name: 'about',
  static: 'ssg',
  template: 'about',
  staticData() {
    return { title: 'About Us', description: '...' };
  },
  staticHead() {
    return '<title>About | MyShop</title>' +
      '<meta name="description" content="...">' +
      '<link rel="canonical" href="https://myshop.com/about">';
  },
  action() { this.render('mainLayout', 'about'); },
});
```

## Escaping

`staticHead()` returns a raw string that is injected into `<head>` verbatim.
Anything that reaches it from the database, a URL parameter, or a user is
untrusted, and `static-render` does not escape it for you. Escape it yourself,
per context:

```js
// lib/escape.js — shared by every staticHead()
export const esc = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// JSON.stringify does not escape "/", so a value containing </script> would
// close the block early. Escape "<" as a unicode sequence, which is valid JSON.
export const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
```

Skipping this is a stored cross-site scripting hole whenever the value can be
written by anyone: the injected markup is served to every later visitor.

## Basic usage — SSR

For pages with data that changes (products, articles, profiles):

```js
FlowRouter.route('/products/:slug', {
  static: 'ssr',
  template: 'productPage',
  async staticData(params) {
    return await Products.findOneAsync({ slug: params.slug });
  },
  async staticHead(params) {
    const p = await Products.findOneAsync({ slug: params.slug });
    // staticHead may be called for a path that no longer resolves.
    if (!p) return '<title>Not found | MyShop</title>';

    return `<title>${esc(p.title)} — $${esc(p.price)} | MyShop</title>` +
      `<meta name="description" content="${esc(p.description)}">` +
      `<script type="application/ld+json">${jsonLd({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.title,
        offers: { '@type': 'Offer', price: p.price, priceCurrency: 'USD' },
      })}</script>`;
  },
  action() { this.render('mainLayout', 'productPage'); },
});
```

## Parameterized SSG routes

For routes with static params where the full set is known at startup (blog posts with fixed slugs, preset landing pages):

```js
FlowRouter.route('/blog/:slug', {
  static: 'ssg',
  template: 'blogPost',
  staticPaths: async () => {
    const posts = await Posts.find({}, { fields: { slug: 1 } }).fetchAsync();
    return posts.map(p => ({
      path: `/blog/${p.slug}`,
      params: { slug: p.slug },
    }));
  },
  staticData: async (params) => await Posts.findOneAsync({ slug: params.slug }),
});
```

All paths are pre-rendered at startup.

## Route options

| Option | Type | Description |
|--------|------|-------------|
| `static` | `'ssg'` \| `'ssr'` | Rendering mode |
| `template` | `String` | Name of the Blaze template to render |
| `staticData` | `Function \| async Function` | Returns the data context for the template. Receives `params` for parameterized routes. |
| `staticHead` | `Function \| async Function` | Returns a string of HTML to inject into `<head>` (title, meta tags, canonical, JSON-LD, etc.). Receives `params`. |
| `staticPaths` | `async Function` | (SSG only) Returns an array of paths to pre-render. Each entry can be a string or `{ path, params }`. |
| `action` | `Function` | Standard flow-router-extra client-side render action. |

## Client-side cleanup

Add this to your client entry point to remove the pre-rendered HTML once the client takes over:

```js
// client/main.js
Meteor.startup(() => {
  document.querySelectorAll('[data-static-render]').forEach(el => el.remove());
});
```

This is not React-style hydration — it's server pre-render + normal client-side Blaze takeover.

## API

### `StaticRender.render(templateName, data, context?)`

Render a template to an HTML string. Returns `{ html, error }`. Used internally by the middleware.

### `StaticRender.regenerate(path)`

Regenerate a single SSG cached page. Useful after a data update:

```js
await Posts.updateAsync(id, { $set: { title: 'New title' } });
await StaticRender.regenerate(`/blog/${slug}`);
```

### `StaticRender.regenerateAll()`

Regenerate all SSG pages from scratch.

### `StaticRender.invalidate(path?)`

Invalidate the SSG cache. Call without arguments to clear all cached pages.

### `StaticRender.stats()`

Returns `{ ssgCacheSize, ssrRoutes, errors, ready }`.

## Template restrictions

Templates rendered by `static-render` must avoid client-only APIs:

- ❌ `Session`, `this.subscribe()`, `Template.dynamic`, `ReactiveVar` reads
- ❌ `onRendered()`, `onDestroyed()` — they don't fire server-side
- ✅ Pure helpers using the `staticData()` result
- ✅ Block helpers (`#each`, `#if`, `#unless`, `#with`, `#let`)

See the [Blaze server rendering guide](https://blazejs.org/blaze/guide/server-rendering) for details.

## Graceful error handling

If a template crashes during server rendering, `static-render` renders a placeholder comment and logs the error with template name and path. The page falls back to normal client-side rendering.

## Constraints to design around

These follow from how server rendering works and are not bugs you can
configure away:

- **Helpers must be synchronous.** Blaze has no asynchronous rendering path, so
  a helper returning a promise renders as a pending promise, not its value.
  Feed the template from `staticData()` instead, which is awaited.
- **Only the template you name is rendered — not your layout.** `action()` is a
  client-side concern; on the server only `template` is rendered. Pre-rendered
  HTML therefore contains no layout chrome, and in particular no navigation
  links, so a crawler that does not run JavaScript finds no links to follow.
  Put anything a crawler must see inside the rendered template.
- **`staticHead()` is appended after your app's `<head>`, not merged into it.**
  If your app has a static `<title>`, a pre-rendered page will contain two, and
  browsers use the first one — the generic one. Remove the static `<title>` from
  apps that pre-render titles per route.
- **There is no way to answer 404.** `staticData()` and `staticHead()` cannot see
  the response, so an unknown slug still returns 200 with a pre-rendered shell.
  Handle unknown records explicitly in the template and in `staticHead()`.
- **Do not put `static:` on a catch-all route.** A `static: 'ssr'` catch-all turns
  every 404 probe — from scanners and crawlers alike — into a database query and
  a render.
- **Client takeover is your responsibility.** Remove the pre-rendered markup and
  keep `document.title` up to date on client-side navigation; see
  [Client-side cleanup](#client-side-cleanup).

## Known limitations

- **Rspack**: works out of the box from Meteor 3.4.1 onwards, which contains the config fix from [meteor#14350](https://github.com/meteor/meteor/pull/14350). Older versions need that fix applied manually.
- **Cache is in-memory**: on Galaxy scaling or multiple instances, each instance maintains its own cache. Cache is rebuilt on startup.
- **No CDN-ready static files**: pre-rendered HTML is served by the Meteor server, not written to disk. For CDN caching, add `Cache-Control` headers via a reverse proxy.

## Related

- [Blaze server rendering](https://blazejs.org/blaze/guide/server-rendering)
- [server-render package](./server-render.md)
