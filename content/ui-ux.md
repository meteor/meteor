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

## User Interface Patterns

There are some patterns for building user interfaces that are useful to keep in mind for a Meteor application.

### Responsive Design
### Accessibility

XXX: Honestly I'm really not sure there's very much Meteor specific in these two headings. I'm not convinced they belong in the guide


### Internationalization

Internationalization (i18n) is the process of generalizing the UI of your app in such a way that it's easy to render all text in a different language. In Meteor, the excellent `tap:i18n` package provides an API for building translations and using them in your templates and elsewhere.

#### Using `tap:i18n`

XXX: I'm going to leave this section for now as it's kind of dependent on modules (it's more complex than maybe it needs to be in Todos right now due to all-packages).

#### Places to translate

It's useful to consider the various places in the system that user-readable strings can come out of and make sure that you are properly using the i18n system to generate those strings in each case.

The obvious place for such strings is HTML -- the content of components that the user sees. Additionally any alerts or other messages that are generated on the client side should be translated also.

Another place to be aware of is messages that are generated by the server that are user visible. An obvious place is emails and any other server generated messages (such as mobile push notifications), but more subtle places are return values and error messages on method calls (which should be sent over the wire in a generic form and translated on the client, see above).

A final place where you may want to translate is the actual data in your database. Of course how you might go about this would be very much a problem unique to your application!

### Event handling

A large part of your UI involves responding to events initated by the user, and there are some steps that you should take to make sure your application does this well

#### Throttling method calls on user action

It's typical to make some kind of change to the database when a user takes an action. However it's important to make sure you don't do this *too* much. For instance, if you wish to save the user's text as they type in a textbox, you should take steps to make sure that you don't send method calls to your database more than every few hundred milliseconds.

If you do not, you'll see performance problems across the board; you'll be flooding the user's network connection with a lot of minute changes, the UI will update on every keystroke, potentially causing poor performance, and your database will suffer with a lot of writes.

To throttle writes, a typical approach is to use underscore's [`.throttle()`](http://underscorejs.org/#throttle) or [`.debounce()`](http://underscorejs.org/#debounce) functions. For instance, in the Todos example app, we throttle writes on user input to 300ms:

```js
Template.todosItem.helpers({
  // update the text of the item on keypress but throttle the event to ensure
  // we don't flood the server with updates (handles the event at most once
  // every 300ms)
  'keyup input[type=text]': _.throttle(function(event) {
    Todos.methods.updateText.call({
      todoId: this.todo._id,
      newText: event.target.value
    }, (err) => {
      err && alert(err.error);
    });
  }, 300)
});
```

#### Limiting re-rendering

Even if you aren't saving data over the wire to the database on every user input, sometimes you still may wish to update in-memory data stores on every user change. In theory this is fine, but in practice sometimes if updating that data store triggers a lot of UI changes, you can see poor performance (and missed keystrokes) when you do that. In such cases you can limit re-rendering by throttling such changes in a similar way to the way we throttle the method call above.

#### Scroll events

Another type of event that fires very frequently is a scroll event. Such event trigger as a user scrolls up and down a page and are commonly used for "waypoint" behaviour. For example in the Localmarket example app, we use the [jquery-waypoints](https://atmospherejs.com/meteor/jquery-waypoints) library to trigger a class being attached to the nav element when you scroll past a certain point:

```js
Template.nav.onRendered(function() {
  var $nav = this.$('nav');
  $nav.siblings('.content-scrollable:not(.static-nav)').children().first().waypoint(function(direction) {
    $nav.toggleClass('scrolled', direction === 'down');
  }, {
    context: '.content-scrollable',
    offset: -200
  });
});
```

An important thing to be careful of is that if you are not using a library such as `jquery-waypooints` to do this, then you need to be careful about not causing too much work to happen in each `scroll` event. If you do so, then users will see poor scrolling performance and your app will not feel performant. You can use a throttle or [`requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame) to make things smooth if you are careful.


## User Experience Patterns

There are some common user experience (UX---as in how your app behaves) patterns that are typical to most Meteor apps that are worth exploring here. These patterns relate heavily to the way the data they are allow the user is interacting with is subscribed to and published, so there are similar sections in the {data loading article} which deal with the data side of them.

### Subscription readiness

When you subscribe to data in Meteor, it does not become instantly available on the client. Typically the user will need to wait for at least a few hundred milliseconds (or as long as a few seconds) for the data to arrive. This is especially noticable when the app first starts up or you move between screens.

There are a few UX techniques for dealing with this waiting period. The simplest is simply to switch out the page you are rendering with a generic "loading" page while you wait for all the data (typically a page may open several subscriptions) to load. As an example, in the Todos example app, we wait until all the public lists and the user's private lists have loaded before we try to render the actual page:

```blaze
{{#if Template.subscriptionsReady}}
  {{> Template.dynamic template=main}}
{{else}}
  {{> appLoading}}
{{/if}}
```

We do this with Blaze's `Template.subscriptionsReady` which is perfect for this purposes, as it waits for all the subscriptions that the current component has asked for to become ready.

#### Per-component loading state

Usually it makes for a better UX to show as much of the screen as possible as quickly as possible and to only show loading state for the parts of the screen that are still waiting on data. So a nice pattern to follow is "per component loading". We do this in the Todos app when you visit the list page---we instantly render the list metadata, such as it's title and privacy settings, and render a loading state for the list of todos while we wait for them to appear.

[SS]

We achieve this by passing the readiness of the todos list down from the smart component which is subscribing (the `listShowPage`) into the pure component which renders the data:

```blaze
{{> listsShow todosReady=Template.subscriptionsReady list=list}}
```

And then we use that state to determing what to render in the pure component (`listShow`):

```blaze
{{#if todosReady}}
  {{#with list._id}}
    {{#each todo in (todos this)}}
      {{> todosItem (todoArgs todo)}}
    {{else}}
      <div class="wrapper-message">
        <div class="title-message">No tasks here</div>
        <div class="subtitle-message">Add new tasks using the field above</div>
      </div>
    {{/each}}
  {{/with}}
{{else}}
    <div class="wrapper-message">
      <div class="title-message">Loading tasks...</div>
    </div>
{{/if}}
```

#### Showing placeholders

You can take the above UI a step further by showing placeholders whilst you wait for the data to load. This is a UX pattern that has been pioneered by Facebook (and that we use in Galaxy also!) which gives the user a more solid impression of what data is coming down the wire. 

In the Todos app, rather than simply writing "Loading tasks..." we could place a number of placeholder tasks which give the impression of the tasks which are still yet to come down the wire.

#### Using the styleguide to prototype loading state

Loading states are notoriously difficult to work on visually as they are by definition transient and often are barely noticeable in a development environment where subscriptions load almost instantly.

This is one reason why being able to achieve any state at will in the component styleguide (see above) is so important and useful. As our pure component `listsShow` simply chooses to render based on it's `todosReady` argument and does not concern itself with a subscription, it is trivial to render it in a styleguide in the loading state.

### Pagination

### Latency compensation

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


## Animation


# UI / UX
9. Animation
  1. Animating attributes changing (velocity-react, not sure of a good Blaze lib)
  2. Animating things appearing + disappearing (velocity-react, momentum)
  3. Animating page changes (complexities around subscriptions, etc)
