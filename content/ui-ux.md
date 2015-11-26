---
title: User Interfaces and User Experience
---

After reading this guide, you'll know:

1. How to build re-usable client side components in any templating language
2. How to build a styleguide to allow you to visually test such pure components
3. Patterns for building front end components in a performant way in Meteor
4. How to design responsively across device sizes, accessibly for different users, and universally across languages.
5. How to build components that can cope with a variety of different data sources
6. How to use animation to keep users informed of changes

## Reusable components

Regardless of the rendering library that you are using, there are some patterns in how you build your User Interface (UI) that will help make your app's code easier to understand, test, and maintain. These patterns, much like general patterns of modularity, revolve around making the interfaces of your UI elements very clear, and avoiding using techniques that bypass these known interfaces.

In this article, we'll refer to the elements in your user interface as "components". Although in some systems, you may refer to them as "templates", it can be a good idea to think of them as something more modular like a component which has an API, rather than a template which is usually seen in a looser way.

To begin with, let's consider two categories of components that are useful to think about:

### Pure Components

A "pure" component is a component which doesn't rely on anything apart from it's inputs (it's *template arguments* in Blaze, or *props* in React) to render. 

In Meteor, specifically this means a component which does not access data from any global sources (typically either Collections or Stores). For instance, in the Todos example app, the `todosItem` template takes in the todo that it is rendering and does not ever look directly in the `Todos` collection.

The advantages of pure components are the following:

 1. They are easy to reason about---you don't need to understand how the data in the global store changes, simply how the arguments to the component change.

 2. They are easy to test---you don't need to be careful about the environment you render them in, all you need to do is provide the right arguments.

 3. They are easy to styleguide---as we'll see in the next section, when styleguiding components, a clean environment makes things much easier to work with.

 4. They are a lot more flexible, and thus can be re-used without requiring re-working.

 ### Global Data stores

 So which are the global data stores that you should be avoiding in pure components? There are a few. Meteor as a framework is built with ease of development in mind, which typically means you can access a lot of things globally. Although this is very useful when building "smart" components (see below), it's a good idea to avoid it in pure ones:

  - Your collections, as well as the `Meteor.users` collection,
  - Accounts information, like `Meteor.user()` and `Meteor.loggingIn()`
  - Current route information
  - Any other client-side data stores (see XXX not sure which article? maybe this one)

### Smart Components

Of course sometimes you do need to access the global data sources to feed data into your application. We call components that need to access data "smart". Such components typically the following things

 1. Subscribe to data, using subscriptions.
 2. Fetch data from those subscriptions.
 3. Fetch global client-side state from stores such as the Router, Accounts, and your own stores.

Ideally, once a smart component has assembled such a set of data, it passes it off to a pure component child to render with. The smart component actually does not render anything apart from one or more pure children.

A typical use case for a smart component is the "page" component that the router points you to when you access a URL. Such a component typically needs to do the three things above and then can pass the resulting arguments into child components. In the Todos example app, the `listShowPage` does exactly this, with a resultingly simple template:

```
<template name="listsShowPage">
  {{#each listIdArray}}
    {{> listsShow todosReady=Template.subscriptionsReady list=list}}
  {{/each}}
</template>
```

## Visually testing pure components

A useful property of pure components is that you can render them anywhere because they don't rely on complicated environments. One very useful thing that this enables is a component _styleguide_ or harness.

A styleguide consists of two parts:

1. A list of "entries"---a component coupled with a list of specifications; basically a list of different arguments that the component expects which trigger different behaviour.

2. A special route in the development version of the application that renders one or more components with one or more of the specificiations.

For instance, in Galaxy, we have a component styleguide that renders each pure component either one specification at a time, or with all specifications at once. 

[ss]

Such rendering enables very quick development of visual aspects of the component in all possible states. Typically in a complex application, it can be quite difficult to achieve certain states of components purely by "using" the application. For example, in Galaxy, the component screen enters quite a complex state if two deploys to the same application are happening simutaneously. This is a very hard to state to reach for a extended period of time if you are simply using the application!

[ss]

XXX: could say a lot more about this, but I feel like we might just blog about it / do a whole article on it's own once we've had a chance to release some code.


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
