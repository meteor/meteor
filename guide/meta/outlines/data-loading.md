# Data Loading and Management

1. Publications + Subscriptions
  1. What are they? - compare REST endpoint
  2. How do they work? - talk about bridging data from server-client collections
  3. What's a pub / what's a sub
2. Defining a publication on the server
  1. Rules around what arguments it should take
  2. Where should it go? (which package -- depends on universality)
3. Subscribing on the client
  1. Subscriptions should be initiated by templates/components that need the data
  2. Global required data should be subscribed by an always there "layout" template
  3. Retrieve the data from the sub at the same point as subscribing, pass down and filter via `cursor-utils`
4. Data loading patterns
  4. Monitoring subscription readiness + errors
    1. Using `Template.subscriptionsReady`
    2. Passing subscription readiness into sub-components alongside data (see UI/UX chapter)
  5. Subscriptions + changing inputs, how autoruns can help.
    1. Basic techniques using `this.autorun`/other reactive contexts and `Template.currentData()`/other reactive sources
    2. How it works
      1. The subscription realizes it's called from within a reactive context
      2. When invalidated, subscription marks itself invalid
      3. When re-running, if re-run with the same arguments, the sub is a no-op
      4. Otherwise the new sub starts, *goes ready*, then the old sub is stopped.
  6. Paginating subscription data -- combining the above
    1. A basic paginated publication
    2. A publication that returns a count
    3. Passing pagination info into a template/component
      1. `totalCount`, `requested`, `currentItems`
    4. Passing a `loadMore` callback into a template/component, using it to increment `requested`.
4. Other data -- global client only data
  1. Concept of a "store"
  2. Types of store:
    1. If it's a single dimension, use a reactive var
    2. If it's a few dimensions (or you need HCR), use a named reactive dict
    3. If you need to query it, use a local collection.
  3. How to listen to a store (autorun / helper / getMeteorData / angular version?)
  4. How to update a store:
    1. Built in APIs
    2. Adding APIs to stores via `XStore.foo = () => {}` (they are singletons, so no need to make class)
5. Updating data via methods
  1. See forms chapter, advanced methods section for details
  2. Method call flow chart
6. Publishing relational data
  1. Common misconceptions about publication reactivity + naive implementation
    1. There's no reactivity in a publish function apart from:
      1. `userId`
      2. The way that `publishCursor` works.
  2. Using publish-composite to get it done the way you'd expect.
  3. Paginating lists (UI/UX chapter)
7. Complex authorization in publications
  1. Is kind of impossible to do correctly - https://github.com/meteor/meteor/issues/5529 (unelss we recommend a fully reactive publish solution, which we don't)
8. Publishing non-mongo data
  1. Custom publication patterns - how to decouple your backend data format from your frontend (if you want!)
  2. Poll-publish [can we publish our Galaxy package here? or has someone made this?]
  3. Be super careful about leaking!! (How to detect this)
9. Turning pubs into REST endpoints (via `simple:rest`)