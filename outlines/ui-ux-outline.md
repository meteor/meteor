# UI / UX

1. Building reusable components to encapsulate UX patterns
  1. Pure vs impure in general
  2. Meteor's global singletons
  3. A component harness / styleguide
2. Event handling
  1. Throttling
3. Responsive design
  1. Very basic ideas using media queries
  2. Suggest some helpful UI libraries such as bootstrap, ionic
  3. Reference mobile chapter, talk about Cordova wrapper
4. Accessiblity
5. Internationalization - using `tap:i18n`
  1. Template / HTML text
  2. Error messages / results of methods
  3. Emails and server-generated communication
6. Subscriptions and readiness
  1. Common patterns around ready vs not-found
7. Pagination + Listing data
  1. A list component pattern
  2. A pagination "controller" pattern
  3. Publishing list counts - using `publish-counts`
  4. Dealing with new data (see 9.2 and 8.3)
8. Latency compensation + reactivity
  1. Deciding if something is "likely" to go wrong (i.e. do we route *before* the method returns? If so what happens if it fails?)
  2. Attaching client-side properties to LC-ed documents ("pending").
  3. Thinking about what happens if the data changes under you (what if the object is deleted?)
9. Animation
  1. Animating attributes changing (velocity-react, not sure of a good Blaze lib)
  2. Animating things appearing + disappearing (velocity-react, momentum)
  3. Animating page changes (complexities around subscriptions, etc)
