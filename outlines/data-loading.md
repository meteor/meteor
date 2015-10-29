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
  4. Monitoring subscription readiness + errors
  5. UX patterns around the above (throw out to UX chapter)
  6. Subscriptions + changing inputs, how autoruns can help.
4. Other data -- client only data
  1. Concept of a "store"---local collection or reactive dict
  2. How to listen to a store (autorun / helper / getMeteorData / angular version?)
5. Updating data
  1. Method call flow chart
  2. Updating store data -- "actions"
6. Publishing relational data
  1. Common misconceptions about publication reactivity + naive implementation
  2. Using publish-composite to get it done
  3. Paginating lists (UI/UX chapter)
7. Complex authorization in publications
  1. Is kind of impossible to do correctly - https://github.com/meteor/meteor/issues/5529 (unelss we recommend a fully reactive publish solution, which we don't)
8. Publishing non-mongo data
  1. Custom publication patterns - how to decouple your backend data format from your frontend (if you want!)
  2. Poll-publish [can we publish our Galaxy package here? or has someone made this?]
  3. Be super careful about leaking!! (How to detect this)
9. Turning pubs into REST endpoints (via `simple:rest`)