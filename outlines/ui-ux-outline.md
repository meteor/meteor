# UI / UX

1. Building reusable components to encapsulate UX patterns
  1. "Pure" components
    1. A component that doesn't need any environment to render, just its arguments
    2. Such a component is easily *testable* which can mean:
      1. Unit tests (see testing article).
      2. Styleguiding (see below).
  2. Meteor's global singletons -- how to avoid them in pure components
  3. "Smart" components
    1. A component that fetches data and passes it to one or more pure components.
    2. Can be a wrapper component that simply does that
    3. Can be something like a "page controller" (see routing chapter).
2. A component harness / styleguide
  1. Rendering a set of pure components with a bunch of test arguments.
  2. Useful for testing visuals in states that aren't necessarily easy to achieve in the app.
  3. "Chromatic" -- our UI testing harness is coming soon (?)
2. Event handling patterns
  1. Throttling method calls
  2. Limiting re-rendering
  3. Being careful with scroll events
3. Responsive design
  1. Very basic ideas using media queries
  2. Suggest some helpful UI libraries such as bootstrap, ionic
  3. Reference mobile chapter, talk about Cordova wrapper
  4. Using modernizr or other capabilities detection
4. Accessiblity
  1. Someone please help me out here ;)
5. Internationalization - using `tap:i18n`
  1. Template / HTML text strings
  2. Error messages / results of methods
  3. Emails and server-generated communication
6. Subscriptions and readiness (see data loading chapter)
  1. Waiting on data for an entire page
  2. Being more subtle and waiting at the component level
  3. Showing "scaffolded" data placeholders, ala Facebook (or Galaxy !)
  4. Using the styleguide to develop these states
7. Pagination + Listing data
  1. A list component pattern
    1. What are the properties we need to render all the cases we care about?
    2. Using the styleguide to mock out these states
  2. A pagination "controller" pattern (see data loading chapter for details around subscriptions)
  3. Dealing with new data (see 9.2 and 8.3)
    1. Display a "something's changed" indicater to rendered 
      1. Using a local collection to store "rendered" data, and a function to re-sync
    2. Calling out data as it appears (see animations).
    3. Link to Dom's design for realtime post
8. Latency compensation + reactivity
  1. Deciding if something is "likely" to go wrong (i.e. do we route *before* the method returns? If so what happens if it fails?)
  2. Attaching client-side properties to LC-ed documents ("pending").
  3. Thinking about what happens if the data changes under you (what if the object is deleted?)
  4. Using a "flash-notifications" pattern to call out "out-of-band" information
9. Animation
  1. Animating attributes changing (velocity-react, not sure of a good Blaze lib)
  2. Animating things appearing + disappearing (velocity-react, momentum)
  3. Animating page changes (complexities around subscriptions, etc)
