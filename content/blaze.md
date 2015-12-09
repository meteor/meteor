---
title: Blaze
---

After reading this guide, you'll know:

1. How to use the Spacebars syntax, used to define templates rendered by the Blaze engine.
2. Best practice towards creating reusable components in Blaze.
3. How the Blaze rendering engine works under the hood and some techniques to best use it.
4. How to test Blaze templates.

Blaze is Meteor's built in reactive rendering library. Using templates written in [Spacebars](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md), a variant of [Handlebars](http://handlebarsjs.com) designed to take advantage of [Tracker](https://github.com/meteor/meteor/tree/devel/packages/tracker), Meteor's reactivity system, you can build components that are rendered by the Blaze library.

Blaze is not required to built applications in Meteor---you can equally use [React](http://react-in-meteor.readthedocs.org/en/latest/) or [Angular](http://www.angular-meteor.com), however this guide will take you through best practice in building an application in Blaze.

<a id="spacebars">Spacebars</a>

Spacebars is a handlebars-like templating language, built off the concept of rendering a reactivily changing *data context*. Spacebars templates look like simple HTML with special "mustache" tags delimited by `{{` and `}}`.

As an example, consider the `todosItem` template from the Todos example app:

```html
<template name="todosItem">
  <div class="list-item {{checkedClass}} {{editingClass}}">
    <label class="checkbox">
      <input type="checkbox" checked={{todo.checked}} name="checked">
      <span class="checkbox-custom"></span>
    </label>

    <input type="text" value="{{todo.text}}" placeholder="Task name">
    <a class="js-delete-item delete-item" href="#">
      <span class="icon-trash"></span>
    </a>
  </div>
</template>
```

In this example, this template is rendered with an object with key `todo` as data context (we'll see below how to enforce that). We access the properties of the `todo`  using the mustache tag, such as `{{todo.text}}`. The default behaviour is to render that property as a string; however in some cases (such as `checked=={{todo.checked}}` it can be resolved as a boolean value).

Note that simple string interpolations like this will always escape any HTML for you---so you don't need to perform safety checks for XSS.

Additionally we can see an example of a *template helper*---`{{checkedClass}}` calls out to the `checkedClass` helper defined in a separate JavaScript file, which combined with the template defines the `todosItem` component:

```js
Template.todosItem.helpers({
  checkedClass() {
    return this.todo.checked && 'checked';
  }
});
```

In the context of a Blaze helper, `this` is scoped to the current current *data context* at the point the helper was used. This can be hard to reason about, so it's often a good idea to instead pass the required data into the helper as an argument.

Apart from simple interpolation, mustache tags can control flow of the template. For instance, in the `listsShow` template, we render a list of todos via:

```html
  {{#each todo in todos}}
    {{> todosItem (todoArgs todo)}}
  {{else}}
    <div class="wrapper-message">
      <div class="title-message">No tasks here</div>
      <div class="subtitle-message">Add new tasks using the field above</div>
    </div>
  {{/each}}
```

This snippet illustrates a few things:

 - The `{{#each in}}` block helper which renders a block one per element in an array or cursor, or an `{{else}}` block if no items exist.
 - Template inclusion `{{> todosItem (todoArgs todo)}}` which renders the `todosItem` component with a set data context, based on the output of the `todosArg` helper.

You can read about the full Spacebars syntax [here](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md), but in this section we'll attempt to cover some important finer details.

<h3 id="data-contexts">Data contexts and lookup</h3>
We've seen `{{todo.title}}` accesses the `title` property of the `todo` item on the current data context. Additionaly, `..` access the parent data context (rarely a good idea), `list.todos.[0]` accesses the first element of the `todos` array on `list`.

Also, note that Spacebars is very forgiving of `null` values. It will not complain if you try to access a property on a `null` value (for instance `foo.bar` if `foo` is not defined), but instead simply treat it also as null. However there are exceptions to this---trying to call a `null` function, or doing the same *within* a helper will lead to exceptions.

<h3 id="helpers">Calling helpers with arguments</h3>
You can provide arguments to a helper like `checkedClass` by simply placing the argument after the helper call, as in: `{{checkedClass todo true 'checked'}}`. You can also provide a list of named keyword arguments to a helper with `{{checkedClass todo noClass=true classname='checked'}}. In this case, you might access those arguments with:

```js
Template.todosItem.helpers({
  checkedClass(todo, kws) {
    const classname = kws.hash.classname || 'checked';
    if (todo.checked) {
      return classname;
    } else if (kws.hash.noClass) {
      return `no-${classname}`;
    }
  }
});
```

You can also pass the output of a helper to a template inclusion or other helper. To do so, use brackets to show precedence:

```html
{{> todosItem (todoArgs todo)}}
```

Here the `todo` is passed as argument to the `todoArgs` helper, then the output is passed into the `todosItem` template.

<h3 id="inclusion">Template inclusion</h3>
You "include" a sub-component with the `{{>` syntax. By default, the sub-component will gain the data context of the caller, although it's usually a good idea to be explicit. You can provide a single object as argument (as we did with the object returned by the `todoArgs` helper above), or provide a list of keyword arguments, as the `listShowPage` template does:

```html
{{> listsShow todosReady=Template.subscriptionsReady
  list=(getFullList listIdOnly) todos=listIdOnly.todos}}
```

In this case, the `listShow` component can expect a data context of the form:

```js
{
  todosReady: ...,
  list: ...,
  todos: ...
}
```

<h3 id="helpers-in-tags">Helpers in tags</h3>
We saw above that using a helper (or data context lookup) in the form `checked={{todo.checked}}` will add the checked property to the HTML tag if `todo.checked` evaluates to true. Also, you can directly include an object in the attribute list of an HTML element to set multiple attributes at once:

```html
<a {{attributes}}>My Link</a>
```

```js
Template.foo.helpers({
  attributes() {
    return {
      class: 'A class',
      style: {background: 'blue'}
    };
  }
});
```

<h3 id="rendering-html">Rendering pure HTML</h3>
Although by default a mustache tag won't render any HTML, for [XSS](https://en.wikipedia.org/wiki/Cross-site_scripting) security reasons, you can render pure HTML with the triple-mustache: `{{{`.

```html
{{{myHtml}}}
```

```js
Template.foo.helpers({
  myHtml() {
    return '<h1>This H1 will render</h1>';
  }
});
```

You should be extremely careful about doing this, and always ensure you aren't returning user-generated content (or escape it if you do!) from such a helper.

<h3 id="block-helpers">Block Helpers</h3>
A block helper, called with `{{#` is a helper that takes (and may render) a block of Spacebars. For instance, we saw the `{{#each in}}` helper above which repeats a given block of Spacebars once per item in a list. You can also render a *component* as a block helper, rendering it's content via the `Template.contentBlock` and `Template.elseBlock`. For instance, you could create your own `{{#if}}` helper with:

```html
<template name="myIf">
  {{#if condition}}
    {{> Template.contentBlock}}
  {{else}}
    {{> Template.elseBlock}}
  {{/if}}
</template>

<template name="caller">
  {{#myIf condition=true}}
    <h1>I'll be rendered!</h1>
  {{/myIf}}
</template>
```

<h3 id="builtin-block-helpers">Builtin Block Helpers</h3>
There are a few builtin block helpers that are worth knowing about:

<h4 id="if-unless">If / Unless</h4>

The `{{#if}}` and `{{#unless}}` helpers are fairly straightforward but invaluable for controlling the control flow of a template. Both operate by evaluating and checking their single argument for "falsey"-ness (in JS this means `null`, `undefined`, `0`, `''`, `[]` and of course `false`).

```html
{{#if something}}
  <p>It's true</p>
{{else}}
  <p>It's false</p>
{{/if}}
```

<h4 id="each-in">Each-in</h4>

The `{{#each in}}` helper is a convenient way to step over a list whilst retaining the outer data context. 

```html
{{#each todo in todos}}
{{/each}}
```

In this case `todo` will be added to the template scope within the block, but all the existing data context items (`list` and `todosReady` in this case) will remain available.

<h4 id="let">Let</h4>
The `{{#let}}` helper is useful to capture the output of a helper or document subproperty within a template:

```html
{{#let name=person.bio.firstName color=generateColor}}
  <div>{{name}} gets a {{color}} card!</div>
{{/let}}
```

Note that `name` and `color` (and `todo` above) are only added to scope in the template, they *are not* added to the data context. Specifically this means if you call a helper, they will not be on `this`. So if you need to access them in a helper, you should pass them in as an argument (like we do with `(todoArgs todo)` above).

<h4 id="each-and-with">Each and With</h4>
There are also two Spacebars builtin that are very common for historical reasons but we discourage the use of (see [use each-in](#use-each-in) below) as they change the data context *within* a template, which is difficult to reason about.

Like `{{#each .. in}}`, `{{#each}}` iterates over an array or cursor, changing the data context within its content block to be the item iterated over. `{{#with}}` simply changes the data context inside itself. In most cases it's better to use `{{#each .. in}}` and `{{#let}}` to achieve the purposes that these are commonly used for.

<h4 id="strictness">Strictness</h4>
Spacebars starts from a very strict interpretation of HTML. In particular you need to careful about self-closing tags and when you are allowed to use them. For instance, you can't self-close a `div` (`<div/>`) in Spacebars, and you need to close some tags that a browser might not require you to (such as a `<p>` tag).

<h4 id="escaping">Escaping</h4>
To insert a literal {{, {{{, or any number of curly braces, put a vertical bar after it. So `{{|` will show up as `{{`, `{{{|` will show up as `{{{`, and so on.

<h2 id="reusable-components">Creating reusable components in Blaze</h2>
In <a href="ui-ux">the UI/UX article</a> we discussed the merits of creating reusable components that are modular and depend and interact with their environment in clear and minimal ways. 

Although Blaze, as a simple template-based runtime, doesn't enforce a lot of these principles (as some other rendering frameworks, such as React, do) you can take steps to write your Blaze components in such a way that you can enjoy most of the same benefits. This section will attempt to outline some "best practice" for writing such Blaze components.

Examples below will reference the `listShow` component from the Todos example app.

<h3 id="validate-data-context">Validate data contexts</h3>
In order to ensure your component is only used in the way you expect, you should validate the data context provided to it. The data context provides the inputs to the component and so should be checked.

XXX: this does not yet work

You can do this in the components `onCreated()` callback, like so:

```js
Template.listsShow.onCreated(function() {
  this.autorun(() => {
    check(Template.data(), new SimpleSchema({
     list: {blackbox: true},
     todosReady: {type: Boolean}
   }));
  });
```

We use an `autorun()` here to ensure that the data context is validated again whenever it changes.

<h3 id="name-data-contexts">Name data contexts to template inclusions</h3>
It's tempting to provide the data context of a sub-template as a "raw" object (like `{{> todosItem todo}}`), it's a better idea to explicitly give it a name (`{{> todosItem todo=todo}}`). There are two primary reasons for this:

1. When using the data in the sub-component, it's a lot clearer what you are accessing `{{todo.title}}` is clearer than `title`.
2. It's more flexible, in case in future you need to provide more arguments to the template.

  For instance, in the case of the `todosItem` sub-component, we need to provide two extra arguments to control the editing state of the item, which would have been a hassle to add if the item was used with a raw `todo` argument.

Additionally, for similar reasons of clarity, always explicitly provide a data context to an inclusion, rather than letting it passively "fall-through".

<h3 id="use-each-in">Prefer `{{#each .. in}}`</h3>
For similar reasons to the above, it's better to use `{{#each todo in todos}}` rather than the older `{{#each todos}}`. The second sets the data context of it's internals to a raw `todo`, and makes it difficult to access the containing template's other data context. 

The only reason not to use `{{#each .. in}}` because it makes it difficult to access the `todo` symbol inside event handlers. Typically the solution to this is simply to use a sub-component to render the inside of the loop.

<h3 id="use-template-instance">Use the template instance</h3>
Although Blaze's simple API doesn't naturally lead to a componentized approach, you can use the *template instance* as a convenient place to modularize functionality. The template instance is `this` inside Blaze's lifecycle callbacks and can be accessed in event handlers and helpers as `Template.instance()`. It's also passed as second argument to event handlers.

We suggest a convention of naming it `instance` in these contexts and assigning it at the top of every relevant helper. For instance:

```js
Template.listsShow.helpers({
  todoArgs(todo) {
    const instance = Template.instance();
    return {
      todo,
      editing: instance.state.equals('editingTodo', todo._id),
      onEditingChange(editing) {
        instance.state.set('editingTodo', editing ? todo._id : false);
      }
    };
  }
});

Template.listsShow.events({
  'click .js-cancel'(event, instance) {
    instance.state.set('editing', false);
  }
});
```

<h3 id="reactive-dict-state">Use a reactive dict for state</h3>
The [`reactive-dict`](https://atmospherejs.com/meteor/reactive-dict) package is a simple API to create a reactive key-value store. It's a convenient way to attach internal state to a component. We create the `state` dict in the `onCreated` callback, and attach it to the template instance:

```js
Template.listsShow.onCreated(function() {
  this.state = new ReactiveDict();
  this.state.setDefault({
    editing: false,
    editingTodo: false
  });
});
```

Once the state has been created we can access it from helpers and modify it in event handlers (see above).

<h3 id="attach-functions-to-instance">Attach functions to the instance</h3>
If you have common functionality for a template instance that needs to be abstracted or called from multiple event handlers, it's sensible to attach it as functions directly to the template instance in the `onCreated()` callback:

```js
Template.listsShow.onCreated(function() {
  this.saveList = () => {
    this.state.set('editing', false);

    Lists.methods.updateName.call({
      listId: this.data.list._id,
      newName: this.$('[name=name]').val()
    }, (err) => {
      err && alert(err.error);
    });
  };
});
```

Then you can call that function from within an event handler:

```js
Template.listsShow.events({
  'submit .js-edit-form'(event, instance) {
    event.preventDefault();
    instance.saveList();
  }
});
```

<h3 id="scope-dom-lookups-to-instance">Scope DOM lookups to the template instance</h3>
It's a bad idea to look up things directly in the DOM with jQuery's global `$()`. It means you are relying on things rendered outside of your component not interacting with your selector. Also, it limits your options on rendering *outside* of the main document (see testing section below).

Instead, Blaze gives you `instance.$()` which scopes a lookup to within the current template instance. Typically you use this either from a `onRendered()` callback to setup external (e.g. jQuery) plugins, or from event handlers to call direct DOM functions. For instance, when a user adds a new todo, we want to focus it's `<input>` element:

```js
Template.listsShow.events({
  'click .js-todo-add'(event, instance) {
    instance.$('.js-todo-new input').focus();
  }
});
```

<h3 id="js-selectors-for-events">Use `.js-` selectors for event maps</h3>
When you are setting up event maps in your JS files, you need to 'select' the element in the template that the event attaches to. Rather than using the same CSS classnames that are used to style the elements, it's better practice to use classnames that are specifically added for those event maps. A reasonable convention is a class starting with `js-` to indicate it is used by the JavaScript. For instance `.js-todo-add` above.

<h3 id="passing-template-content">Passing HTML content as template arguments</h3>
If you need to pass in content to a sub-component (for instance the content of a modal dialog), you can use the [custom block helper](#block-helpers) to provide a block of content. If you need more flexibility, typically just providing a named component in the data context is the way to go. The sub-component can then just render that component with:

```html
{{> Template.dynamic templateName dataContext}}
```

This is more or less the way that the [`kadira:blaze-layout`](https://atmospherejs.com/kadira/blaze-layout) package works in practice.

<h3 id="pass-callbacks">Pass callbacks</h3>
If you need to communicate *up* the component hierarchy, it's best to pass a *callback* for the sub-component to call.

For instance, only one todo item can be currently in the editing state at a time, so the `listsShow` component manages the state of which is edited. So when you focus on an item, that item needs to tell the list's component to make it the "edited" one. To do that, we pass a callback into the `todosItem` component, and it calls it:

```html
{{> todosItem (todoArgs todo)}}
```

```js
Template.listsShow.helpers({
  todoArgs(todo) {
    const instance = Template.instance();
    return {
      todo,
      editing: instance.state.equals('editingTodo', todo._id),
      onEditingChange(editing) {
        instance.state.set('editingTodo', editing ? todo._id : false);
      }
    };
  }
});

Template.todosItem.events({
  'focus input[type=text]'() {
    this.onEditing(true);
  }
});
```

<h3 id="onrendered-for-libs">Use `onRendered()` to callout to 3rd party libraries</h3>
As we mentioned above, the `onRendered()` callback is typically the right spot to call out to third party libraries that expect a pre-rendered DOM (such as jQuery plugins). The `onRendered()` callback is triggered *once* after the component has rendered and attached to the DOM for the first time.

Occasionally, you may need to wait for data to become ready before it's time to attach the plugin (although typically it's a better idea to use a sub-component in this use case). To do so, you can setup an `autorun` in the `onRendered()` callback. For instance, in the `listShowPage` template, we want to wait until the subscription for the list is ready (i.e. the todos have rendered) before we hide the launch screen:

```
Template.listsShowPage.onRendered(function() {
  this.autorun(() => {
    if (this.subscriptionsReady()) {
      // Handle for launch screen defined in app-body.js
      AppLaunchScreen.listRender.release();
    }
  });
});
```

<h2 id="smart-components">Writing smart components with Blaze</h2>
If your component needs to access state outside of its data context---for instance, data from the server via subscriptions or the the contents of client-side store, then you should be careful how you do that accessing. As discussed in the [data loading](data-loading) and [UI](ui-ux#smart-components) articles, you should be careful and considered in how use such smart components.

To begin with, all of the rules of thumb about reusable components apply to smart components. In addition:

<h3 id="subscribing">Subscribe from `onCreated`</h3>
You should subscribe to publications on the server from an `onCreated` callback (within an `autorun` block if you are reliant on reactively changing arguments). In the Todos example app, in the `listsShowPage` template we subscribe to the `list/todos` publication based on the current `_id` FlowRouter param:

```js
Template.listsShowPage.onCreated(function() {
  this.getListId = () => FlowRouter.getParam('_id');

  this.autorun(() => {
    this.subscribe('list/todos', this.getListId());
  });
});
```

By using `this.subscribe()` (as opposed to `Meteor.subscribe`), the subscription state automatically gets amalagamated into the template instance's subscription readiness reactive state variable, which can be used both from within templates (via the `{{Template.subscriptionsReady}}` helper) or within helpers (via `instance.subscriptionsReady()`).

Notice as well in this case that we access the global client-side state store `FlowRouter` in this component, which we access via a instance method (`getListId()`), called both from the autorun, and from the `listArray` helper:

```js
Template.listsShowPage.helpers({
  // We use #each on an array of one item so that the "list" template is
  // removed and a new copy is added when changing lists, which is
  // important for animation purposes. #each looks at the _id property of it's
  // items to know when to insert a new item and when to update an old one.
  listArray() {
    const instance = Template.instance();
    const list = Lists.findOne(instance.getListId());
    return list ? [list] : [];
  }
});
```

<h3 id="fetch-in-smart-components">Fetch in helpers</h3>
Typically, as [outlined in the ui/ux article](ui-ux.md#smart-components) you should fetch data in the same component that you subscribe in. In Blaze, it's usually simplest to fetch the data in a helper, which you can then use to pass data into a reusable child component. For example, in the `listShowPage`: 

```html
{{> listsShow todosReady=Template.subscriptionsReady
  list=(getFullList listIdOnly) todos=listIdOnly.todos}}
```

<h2 id="reusing-code">Reusing code in Blaze</h2>
It's not uncommon to want to reuse code between two otherwise unrelated components. There are two principal ways to do this in Blaze.

<h3 id="composition">Composition</h3>
If possible, it's usually best to try and abstract out the reusable part of the two components that need to share functionality. If you are used to following patterns to [create reusable components](#reusable-components), then it should be simple to reuse those components in many places. 

<h3 id="utility-libraries">Utility libraries</h3>
It's usually best to keep your view layer as "skinny" as possible and contain a component to whatever specific task it specifically needs to do. If there's heavy lifting involved (such as complicated rendering logic), it often makes sense to abstract it out into a utility library that simply deals with the logic alone and doesn't deal with the Blaze system at all. 

For instance, if a component requires a lot of complicated [D3](d3js.org) code for drawing graphs, it's likely that that code itself could live in a utility library that's called by the component. That makes it easier to abstract the code later and share it between various components that need to all draw graphs.

<h3 id="global-helpers">Global Helpers</h3>
One type of library that is useful is a global Spacebars helper. You can define these with the `Template.registerHelper()` function. Typically you register helpers to do simple things (like rendering dates in a given format) which don't justify a separate sub-component. For instance, you could do:

```js
Template.registerHelper('shortDate', (date) => {
  return moment(date).format("MMM do YY");
});
```

```html
<template name="myBike">
  <dl>
   <dt>Date registered</dt>
   <dd>{{shortDate bike.registeredAt}}</dd>
 </dl>
</template>
```

<h2 id="understanding-blaze">Understanding Blaze</h2>
Although Blaze is a very intuitive rendering system, it does have some quirks and complexities that are worth knowing about when you are trying to do complex things.

<h3 id="re-rendering">Re-rendering</h3>
Blaze is intended to be opaque about re-rendering. Tracker and Blaze are designed as "eventual" systems that end up fully reflecting any data change, but may take a few steps in getting there, depending on how they are used. This can be the subject of frustration if you are trying to control how your component is re-rendered.

The first thing to consider here is if you actually need to care about your component re-rendering. Blaze is optimized so that it typically doesn't matter if a component is re-rendered even if it strictly shouldn't. If you make sure that your helpers are cheap to run and consequently rendering is not expensive, then you probably don't need to worry about this.

The main thing to understand about how Blaze re-renders is that re-rendering happens at the level of helpers and template inclusions. Whenever the *data context* of a component changes, it necessarily must re-run *all* helpers and data accessors (as `this` within the helper is the data context and thus will have changed). 

Additionally, helpers will re-run if any *reactive variable* accessed from within *that specific helper* changes.

You can often work out *why* a helper has re-run by tracing the source of the reactive invalidation:

```js
Template.myTemplate.helpers({
  helper() {
    // When this helper is scheduled to re-run, the `console.trace` will log a stack trace of where
    // the invalidation has come from (typically a `changed` message from some reactive variable).
    Tracker.onInvalidate(() => console.trace());
  }
});
```

<h3 id="controlling-re-rendering">Controlling re-rendering</h3>
If your helper or sub-component is expensive to run, and often re-runs without any visible effect, you can short circuit unnecessary re-runs by using a more subtle reactive data source. A good candidate is provided by the [`peerlibrary:computed-field`](https://atmospherejs.com/peerlibrary/computed-field) library.

<h3 id="attribute-helpers">Attribute helpers</h3>
Setting tag attributes via helpers (e.g. `<div {{attributes}}>`) is a neat tool and has some precedence rules that make it more useful. Specifically, when you use it more than once on a given element, the attributes are composed (rather than the second set of attributes simply replacing the first). So you can use one helper to set one set of attributes and a second to set another. For instance:

```html
<template name="myTemplate">
  <div id="my-div" {{classes 'foo' 'bar'}} {{backgroundImageStyle 'my-image.jpg'}}>My div</div>
</template>
```

```js
Template.myTemplate.helpers({
  classes(names) {
    return {class: names.map(n => `my-template-${n}`)};
  },
  backgroundImageStyle(imageUrl) {
    return {
      style: {
        backgroundImage: `url(${imageUrl})`
      }
    };
  }
})
```
<h3 id="lookups">Lookup order</h3>
Another complicated topic in Blaze is name lookups. In what order does Blaze look when you write `{{something}}`? It runs in the following order:

1. Helper defined on the current component.
2. Binding (eg. from `{{#let}}` or `{{#each in}}`) in current scope
3. A named template
4. Global helpers
5. The current data context.

<h3 id="build-system">Blaze and the build system</h3>
As mentioned in the [build system article](build-tool#blaze), the [`blaze-html-templates`](https://atmospherejs.com/meteor/blaze-html-templates) package scans your source code for `.html` files, picks out `<template name="templateName">` tags, and compiles them into a JavaScript file that defines a function that implements the component in code, attached to the `Template.templateName` symbol.

This means when you include another component, you are simply running a function on the client that corresponds to the Spacebars content you defined in the `.html` file.

<h3 id="views">What is a view</h3>
Blaze has an additional concept called a "view", which is associated with a reactively rendering area of a template. The view is the machinery that works behind the scenes to track reactivity, do lookups, and re-render appropriately when data changes. The view is the unit of re-rendering in Blaze. You can if necessary, use the view to walk the rendered component heirarchy, although, except in advanced cases it's better to not do this, but instead use callbacks and template arguments, or global data stores to communicate between components.

You can read more about views in the [Blaze docs](http://docs.meteor.com/#/full/blaze_view).



6. Testing Blaze templates
  1. Rendering a template in a unit test
  2. Querying the DOM (general but just a pointer here)
  3. Triggering reactivity and waiting for re-rendering
  4. Simulating events w/ JQ
7. Useful Blaze utilities / other approaches
  1. https://github.com/peerlibrary/meteor-blaze-components
  2. https://github.com/raix/Meteor-handlebar-helpers
  3. Much, much more...