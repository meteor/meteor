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

In the {% page_link data-loading 'Data Loading' %} we discuss a pattern of paging through an "infinite scroll" type subscription which increases one page at a time as a user steps through data in your application. It's interesting to consider UX patterns to both consume that data and indicate what's happening to the user.

#### A list component

Let's consider any generic item-listing component. To fix on a concrete example, we could consider the todo list in the Todos example app. Although it does not, it certainly could paginate through the todos for a given list.

There are a variety of states that such a list can be in:

 1. Initially loading, no data available yet.
 2. Showing a subset of the items with more available.
 3. Showing a subset of the items with more loading.
 4. Showing *all* the items.
 5. Showing *no* items because none exist.

It's instructive to think about what arguments such a component would need to differentiate between those five states. Let's consider a generic pattern that would work in all cases where we provide the following information:

 - A `count` of the total number of items.
 - A `countReady` boolean that indicates if we know that count yet (remember we need to load even that information).
 - A number of items that we have `requested`.
 - A list of `items` that we currently know about.

We can now distinguish between the 5 states above based on these flags:

1. If `countReady` is false, or `count > 0` and `items` is still empty. (These are actually two different states, but doesn't seem important to visually separate them).
2. If `items.length === requested` but `count > requested`.
3. If `0 < items.length < requested`.
4. If `items.length === requested === count > 0`
5. If `items.length === requested === count === 0`

You can see that although the situation is a little complex, it's also completely determined by the arguments and thus very much testable. A component styleguide helps immeasurably in seeing all these states easily! In Galaxy we have each state in our styleguide for each of the lists of our app and we can ensure all work as expected and appear correctly:

[ss]

#### A pagination "controller" pattern

A list is also a good opportunity to understand the benefits of the smart vs pure component split. We've seen above that correctly rendering and visualising all the possible states of a list is non-trivial and is made much easier by having a pure list component that takes all the required information in as arguments.

However, we still need to subscribe to the list of items and the count, and collect that data somewhere. To do this, it's sensible to use a smart wrapper component (sort of analogous to an MVC "controller") who's job it is to subscribe and fetch the relevant data.

In the Todos example app, we already have a wrapping component for the list that talks to the router and sets up subscriptions. This component could easily be extended to understand pagination:

```js
const PER_PAGE = 10;

Template.listsShowPage.onCreated(function() {
  this.state = new ReactiveDict();
  this.autorun(() => {
    this.state.set('listId', FlowRouter.getParam('_id'));
    this.subscribe('list/todos', this.state.get('listId'), this.state.get('requested'));
    this.countSub = this.subscribe('list/todoCount', this.state.get('listId'));
  });
  this.onNextPage = () => {
    this.state.set('requested', this.state.get('requested') + PER_PAGE);
  };
});

Template.listsShowPage.helpers({
  listShowArguments() {
    const instance = Template.instance();
    const listId = instance.state.get('listId');
    const list = Lists.findOne(listId);
    const requested = instance.state.get('requested');
    return {
      list,
      todos: list.todos({}, {limit: requested}),
      requested,
      countReady: instance.countSub.ready(),
      count: Counts.get(`list/todoCount${listId}`),
      onNextPage: instance.onNextPage
    };
  }
});
```

#### UX patterns for displaying new data

An interesting UX challenge in a realtime system like Meteor involves how to bring new information (like changing data in a list) to the user's attention. As [Dominic](http://blog.percolatestudio.com/design/design-for-realtime/) points out, it's not always a good idea to simply update the contents of a list as quickly as possible as it's easy to miss changes or get confused about what's happened.

One solution to this problem is to *animate* list changes (which we'll look at below), but this isn't always the best approach. For instance, if a user is reading a list of comments, they may not want to see any changes until they are done with their current reading.

An option in this case is to call out that there are changes to the data the user is looking at without actually making UI updates. Of course with a reactive across the board system like Meteor, it isn't necessarily easy to stop such changes from happening! 

However, it is possible to do this thanks to our split between smart and pure components. The pure component simply renders what it's given, so we use our smart component to control that information. We can use a *Local Collection* to store the rendered data, and then push data into it when the user requests:

```js
Template.listsShowPage.onCreated(function() {
  ...

  this.visibleTodos = new Mongo.Collection();

  this.getTodos = () => {
    const list = Lists.findOne(this.state.get('listId'));
    return list.todos({}, {limit: instance.state.get('requested')});
  };
  this.syncTodos = (todos) => {
    todos.forEach(todo => this.visibleTodos.insert(todo));
    this.state.set('hasChanges', false);
  };
  this.onShowChanges = () => {
    this.syncTodos(this.getTodos());
  };

  this.autorun((computation) => {
    const todos = this.getTodos();

    // if this autorun re-runs, the list or set of todos much have changed
    if (!computation.firstRun) {
      this.state.set('hasChanges', true);
    } else {
      this.syncTodos(todos);
    }
  });
});

Template.listsShowPage.helpers({
  listShowArguments() {
    const instance = Template.instance();
    const listId = instance.state.get('listId');
    const list = Lists.findOne(listId);
    const requested = instance.state.get('requested');
    return {
      list,
      todos: instance.visibleTodos.find({}, {limit: requested}),
      requested,
      countReady: instance.countSub.ready(),
      count: Counts.get(`list/todoCount${listId}`),
      onNextPage: instance.onNextPage,
      hasChanges: instance.state.get('hasChanges'),
      onShowChanges:instance.onShowChanges
    };
  }
});
```

The pure sub-component can then use the `hasChanges` argument to determine if it show some kind of callout to the user to indicate changes are available, and then use the `onShowChanges` callback to trigger them to be shown.

### Optimisitic UI

Another UX pattern which is worth thinking about in Meteor and which isn't necessarily something that comes up in other frameworks is how to approach optimistic UI. Optimistic UI is the process of showing user-generated changes in the UI without waiting for the server to acknowledge that the change has succeeded (thus the "optimism"). It is a cruicial feature of Meteor to allow you to build your UIs in this kind of way.

However, it's not *always* necessarily a good idea to be optimistic. Sometimes we may actually want to wait for the server's response. For instance, when a user is logging in, you *have* to wait for the server to check the password is correct before you can start allowing them into the site.

So when should you wait for the server and when not? It basically comes down to how optimistic you are; how likely it is something go wrong. In the case of a password, you really can't tell on the client, so you need to be conservative. In other cases, you can be pretty confident that the method call will succeed, and so you can move on. 

For instance, in the Todos example app, when creating a new list, it's hard to imagine what could go wrong on the server, so we write:

```js
Template.appBody.events({
  'click .js-new-list'() {
    const listId = Lists.methods.insert.call((err) => {
      if (err) {
        // At this point, we have already redirected to the new list page, but
        // for some reason the list didn't get created. This should almost never
        // happen, but it's good to handle it anyway.
        FlowRouter.go('home');
        alert('Could not create list.');
      }
    });

    FlowRouter.go('listsShow', { _id: listId });
  }
});
```

By placing the `FlowRouter.go('listsShow')` outside of the callback of the Method call (which happens once the server has finished), we ensure that it runs right away. So first we *simulate* the method (which creates a list locally in Minimongo), then route to it. Eventually the server returns, usually creating the exact same list (which the user will not even notice), or in the unlikely event that it 
fails, we show an error and redirect back to the homepage.

### Indicating when a write has succeeded

Sometimes the user may be interested to know when the update has hit the server. For instance, in a chat application, it's a typical pattern to optimistically display the message in the chat log, bit indicate that it is "pending" until the server has acknowledged the write. We can do this easily in Meteor by simply modifying the Method to act differently on the client:

```js
Messages.methods.insert = new Method({
  name: 'Messages.methods.insert',
  schema: new SimpleSchema({
    text: {type: String}
  }),
  run(message) {
    // In the simulation (on the client), we add an extra pending field. 
    // It will be removed when the server comes back with the "true" data.
    if (this.isSimulation) {
      message.pending = true;
    }

    Messages.insert(message);
  }
})
```

Of course in this scenario, you also need to be prepared for the server to fail, and again, indicate it to the user somehow.

### Unexpected failures

We've seen examples above of failures which you don't really anticipate will happen. It's difficult to program fully defensively and cover off every situation, however unlikely. However, there are some catchall patterns that you can use for failures that are truly unexpected.

Thanks to Meteor's automatic handling of optimistic UI, usually if a method unexpectedly fails your Minimongo database will end up in a consistent state, and if you are rendering directly from it, the user should see something that makes sense (even if it's not what they anticipated of course!). In some cases, you may need to make changes to local state (like the routing that we did in the new list example able) to reflect this.

However, it's a terrible UX to simply jump the user to an unexpected state without explaining what's happened. We used a `alert()` above, which is a pretty poor option, but gets the job done. One better approach is to indicate changes via a "flash notification", which is a UI element that's displayed "out-of-band", typically in the top right of the screen, given the user *some* indication of what's happened.

[ss of galaxy]


## Animation

Animation is the process indicating changes in the UI *over time* rather than *instantly*. Although animation is often seen as "window dressing" or ostentatiousness, in fact it serves a very important purpose, highlighted by the example of the changing list above. In a connected-client world where changes in the UI aren't always initiated by user action (i.e. sometimes they happen as a result of the server sending changes made by other users), instant changes rarely make for a comprehendable or pleasing interaction.

### Animating changes in visiblity

Probably the most fundamental type of UI change that requires animation is when items appear or disappear. In Blaze, we can use the [`percolate:momentum`](https://atmospherejs.com/percolate/momentum) to plug a standard set of animations from the [`velocity`](http://julian.com/research/velocity/) into such state changes.

A good example of this is the editing state of the list from the Todos example app:

```blaze lists-show.js
{{#momentum plugin="fade"}}
  {{#if instance.state.get 'editing'}}
    <form class="js-edit-form list-edit-form">...</form>
  {{else}}
    <div class="nav-group">...</div>
  {{/if}}
{{/momentum}}
```

Momentum acts by defining the way that child HTML elements appear an disappear. In this case, when the list component goes into the `editing` state, the `.nav-group` disappears, and the `form` appears. Momentum takes care of the job of making sure that both items fade an the change is made a lot clearer.

### Animating changes to attributes

Another common type of animation is when an attribute of an element changes. For instance, a button may change color when you click on it. These type of animations are easiest achieved with [CSS transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Transitions/Using_CSS_transitions), as for example with the link in the Todos example app:

```less
a {
  transition: all 200ms ease-in;
  color: @color-secondary;
  cursor: pointer;
  text-decoration: none;

  &:hover { color: darken(@color-primary, 10%); }
  &:active { color: @color-well; }
  &:focus { outline:none; } //removes FF dotted outline
}
```

### Animating page changes

Finally, it's common to animate when the user switches between routes of the application. Especially in mobile, this adds a sense of navigation to the app via positioning pages relative to each other. This can be done in a similar way to animating things appearing and disappearing (after all one page is appearing and other is disappearing), but there are some tricks that are worth being aware of.

Let's consider the case of the Todos example app. Here we do a similar thing to achieve animation between pages, by using Momentum in the main layout template:

```blaze
{{#momentum plugin="fade"}}
  {{#if Template.subscriptionsReady}}
    {{> Template.dynamic template=main}}
  {{else}}
    {{> appLoading}}
  {{/if}}
{{/momentum}}
```

The primary issue is that the rendering system may prefer to simply change an existing component rather than switching it out and triggering the animation system. For example in the Todos example app, when you navigate between lists, by default Blaze would try to simply re-render the `listsShow` component with a new `listId` (a changed argument) rather than pull the old list out and put in a new one. This is an optimization that we want to avoid here! However, we want to make sure this *only* happens when the `listId` changes and not on other reactive changes.

To do so in this case, we can use a little trick (that is specific to Blaze, although similar techniques apply to other rendering engines) of using the fact that the `{{#each}}` helper treats arrays of documents with an `_id` as keyed on `_id`. So we wrap our template in an `{{}}

```blaze
<template name="listsShowPage">
  {{#each list in listArray}}
    {{> listsShow todosReady=Template.subscriptionsReady list=list}}
  {{/each}}
</template>
```

```js
Template.listsShowPage.helpers({
  // We use #each on an array of one item so that the "list" template is
  // removed and a new copy is added when changing lists, which is
  // important for animation purposes. #each looks at the _id property of it's
  // items to know when to insert a new item and when to update an old one.
  listArray() {
    const instance = Template.instance();
    const list = Lists.findOne(instance.state.get('listId'));
    return [list];
  }
});
```
