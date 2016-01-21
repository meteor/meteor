---
title: Blaze
order: 7
description: How to use Blaze, Meteor's frontend rendering system, to build usable and maintainable user interfaces.
---

After reading this guide, you'll know:

1. How to use the Spacebars language to define templates rendered by the Blaze engine.
2. Best practices for writing reusable components in Blaze.
3. How the Blaze rendering engine works under the hood and some advanced techniques for using it.
4. How to test Blaze templates.

Blaze is Meteor's built in reactive rendering library. Usually, templates are written in [Spacebars](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md), a variant of [Handlebars](http://handlebarsjs.com) designed to take advantage of [Tracker](https://github.com/meteor/meteor/tree/devel/packages/tracker), Meteor's reactivity system. These templates are compiled into JavaScript UI components that are rendered by the Blaze library.

Blaze is not required to build applications in Meteor---you can also easily use [React](http://react-in-meteor.readthedocs.org/en/latest/) or [Angular](http://www.angular-meteor.com) to develop your UI. However, this particular article will take you through best practices in building an application in Blaze, which is used as the UI engine in all of the other articles.

<h2 id="spacebars">Spacebars</h2>

Spacebars is a handlebars-like templating language, built on the concept of rendering a reactively changing *data context*. Spacebars templates look like simple HTML with special "mustache" tags delimited by curly braces: `{% raw %}{{ }}{% endraw %}`.

As an example, consider the `Todos_item` template from the Todos example app:

```html
<template name="Todos_item">
  <div class="list-item {{checkedClass todo}} {{editingClass editing}}">
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

This template expects to be rendered with an object with key `todo` as data context (we'll see [below](#validate-data-context) how to enforce that). We access the properties of the `todo` using the mustache tag, such as `{% raw %}{{todo.text}}{% endraw %}`. The default behavior is to render that property as a string; however for some attributes (such as `checked={% raw %}{{todo.checked}}{% endraw %}`) it can be resolved as a boolean value.

Note that simple string interpolations like this will always escape any HTML for you, so you don't need to perform safety checks for XSS.

Additionally we can see an example of a *template helper*---`{% raw %}{{checkedClass todo}}{% endraw %}` calls out to a `checkedClass` helper defined in a separate JavaScript file. The HTML template and JavaScript file together define the `Todos_item` component:

```js
Template.Todos_item.helpers({
  checkedClass(todo) {
    return todo.checked && 'checked';
  }
});
```

In the context of a Blaze helper, `this` is scoped to the current *data context* at the point the helper was used. This can be hard to reason about, so it's often a good idea to instead pass the required data into the helper as an argument (as we do here).

Apart from simple interpolation, mustache tags can be used for control flow in the template. For instance, in the `Lists_show` template, we render a list of todos like this:

```html
  {{#each todo in todos}}
    {{> Todos_item (todoArgs todo)}}
  {{else}}
    <div class="wrapper-message">
      <div class="title-message">No tasks here</div>
      <div class="subtitle-message">Add new tasks using the field above</div>
    </div>
  {{/each}}
```

This snippet illustrates a few things:

 - The `{% raw %}{{#each .. in}}{% endraw %}` block helper which repeats a block of HTML for each element in an array or cursor, or renders the contents of the `{% raw %}{{else}}{% endraw %}` block if no items exist.
 - The template inclusion tag, `{% raw %}{{> Todos_item (todoArgs todo)}}{% endraw %}` which renders the `Todos_item` component with the data context returned from the `todosArg` helper.

You can read about the full syntax [in the Spacebars README](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md). In this section we'll attempt to cover some of the important details beyond just the syntax.

<h3 id="data-contexts">Data contexts and lookup</h3>

We've seen that `{% raw %}{{todo.title}}{% endraw %}` accesses the `title` property of the `todo` item on the current data context. Additionally, `..` accesses the parent data context (rarely a good idea), `list.todos.[0]` accesses the first element of the `todos` array on `list`.

Note that Spacebars is very forgiving of `null` values. It will not complain if you try to access a property on a `null` value (for instance `foo.bar` if `foo` is not defined), but instead simply treats it also as null. However there are exceptions to this---trying to call a `null` function, or doing the same *within* a helper will lead to exceptions.

<h3 id="helpers">Calling helpers with arguments</h3>

You can provide arguments to a helper like `checkedClass` by simply placing the argument after the helper call, as in: `{% raw %}{{checkedClass todo true 'checked'}}{% endraw %}`. You can also provide a list of named keyword arguments to a helper with `{% raw %}{{checkedClass todo noClass=true classname='checked'}}{% endraw %}`. When you pass keyword arguments, you need to read them off of the `hash` property of the final argument. Here's how it would look for the example we just saw:

```js
Template.Todos_item.helpers({
  checkedClass(todo, options) {
    const classname = options.hash.classname || 'checked';
    if (todo.checked) {
      return classname;
    } else if (kws.hash.noClass) {
      return `no-${classname}`;
    }
  }
});
```

Note that using keyword arguments to helpers is a little awkward, so in general it's usually easier to avoid them. This feature was included for historical reasons to match the way keyword arguments work in Handlebars.

You can also pass the output of a helper to a template inclusion or other helper. To do so, use parentheses to show precedence:

```html
{{> Todos_item (todoArgs todo)}}
```

Here the `todo` is passed as argument to the `todoArgs` helper, then the output is passed into the `Todos_item` template.

<h3 id="inclusion">Template inclusion</h3>

You "include" a sub-component with the `{% raw %}{{> }}{% endraw %}` syntax. By default, the sub-component will gain the data context of the caller, although it's usually a good idea to be explicit. You can provide a single object which will become the entire data context (as we did with the object returned by the `todoArgs` helper above), or provide a list of keyword arguments which will be put together into one object, like so:

```html
{{> subComponent arg1="value-of-arg1" arg2=helperThatReturnsValueOfArg2}}
```

In this case, the `subComponent` component can expect a data context of the form:

```js
{
  arg1: ...,
  arg2: ...
}
```

<h3 id="attribute-helpers">Attribute Helpers</h3>

We saw above that using a helper (or data context lookup) in the form `checked={% raw %}{{todo.checked}}{% endraw %}` will add the checked property to the HTML tag if `todo.checked` evaluates to true. Also, you can directly include an object in the attribute list of an HTML element to set multiple attributes at once:

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

<h3 id="rendering-html">Rendering raw HTML</h3>

Although by default a mustache tag will escape HTML tags to avoid [XSS](https://en.wikipedia.org/wiki/Cross-site_scripting), you can render raw HTML with the triple-mustache: `{% raw %}{{{ }}}{% endraw %}`.

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

A block helper, called with `{% raw %}{{# }}{% endraw %}` is a helper that takes (and may render) a block of HTML. For instance, we saw the `{% raw %}{{#each .. in}}{% endraw %}` helper above which repeats a given block of HTML once per item in a list. You can also use a template as a block helper, rendering its content via the `Template.contentBlock` and `Template.elseBlock`. For instance, you could create your own `{% raw %}{{#if}}{% endraw %}` helper with:

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

The `{% raw %}{{#if}}{% endraw %}` and `{% raw %}{{#unless}}{% endraw %}` helpers are fairly straightforward but invaluable for controlling the control flow of a template. Both operate by evaluating and checking their single argument for truthiness. In JS `null`, `undefined`, `0`, `''`, `[]`, and `false` are considered "falsy", and all other values are "truthy".

```html
{{#if something}}
  <p>It's true</p>
{{else}}
  <p>It's false</p>
{{/if}}
```

<h4 id="each-in">Each-in</h4>

The `{% raw %}{{#each .. in}}{% endraw %}` helper is a convenient way to step over a list while retaining the outer data context.

```html
{{#each todo in todos}}
  {{#each tag in todo.tags}}
    <!-- in here, both todo and tag are in scope -->
  {{/each}}
{{/each}}
```

<h4 id="let">Let</h4>

The `{% raw %}{{#let}}{% endraw %}` helper is useful to capture the output of a helper or document subproperty within a template. Think of it just like defining a variable using JavaScript `let`.

```html
{{#let name=person.bio.firstName color=generateColor}}
  <div>{{name}} gets a {{color}} card!</div>
{{/let}}
```

Note that `name` and `color` (and `todo` above) are only added to scope in the template, they *are not* added to the data context. Specifically this means if you call a helper, they will not be on `this`. So if you need to access them in a helper, you should pass them in as an argument (like we do with `(todoArgs todo)` above).

<h4 id="each-and-with">Each and With</h4>

There are also two Spacebars built in helpers, `{% raw %}{{#each}}{% endraw %}`, and `{% raw %}{{#with}}{% endraw %}`, which we do not recommend using (see [use each-in](#use-each-in) below). These block helpers change the data context within a template, which can be difficult to reason about.

Like `{% raw %}{{#each .. in}}{% endraw %}`, `{% raw %}{{#each}}{% endraw %}` iterates over an array or cursor, changing the data context within its content block to be the item in the current iteration. `{% raw %}{{#with}}{% endraw %}` simply changes the data context inside itself to the provided object. In most cases it's better to use `{% raw %}{{#each .. in}}{% endraw %}` and `{% raw %}{{#let}}{% endraw %}` instead, just like it's better to declare a variable than use the JavaScript `with` keyword.

<h4 id="strictness">Strictness</h4>

Spacebars has a very strict HTML parser. For instance, you can't self-close a `div` (`<div/>`) in Spacebars, and you need to close some tags that a browser might not require you to (such as a `<p>` tag). Thankfully, the parser will warn you when it can't understand your code with an exact line number for the error.

<h4 id="escaping">Escaping</h4>

To insert literal curly braces: `{% raw %}{{ }}{% endraw %}` and the like, add a pipe character, `|`:

```
<!-- will render as <h1>All about {{</h1> -->
<h1>All about {{|</h1>

<!-- will render as <h1>All about {{{</h1> -->
<h1>All about {{{|</h1>
```

<h2 id="reusable-components">Reusable components in Blaze</h2>

In <a href="ui-ux">the UI/UX article</a> we discussed the merits of creating reusable components that interact with their environment in clear and minimal ways.

Although Blaze, which is a simple template-based rendering engine, doesn't enforce a lot of these principles (unlike other frameworks like React and Angular) you can enjoy most of the same benefits by following some conventions when writing your Blaze components. This section will outline some of these "best practices" for writing reusable Blaze components.

Examples below will reference the `Lists_show` component from the Todos example app.

<h3 id="validate-data-context">Validate data context</h3>

In order to ensure your component always gets the data you expect, you should validate the data context provided to it. This is just like validating the arguments to any Meteor Method or publication, and lets you write your validation code in one place and then assume that the data is correct.

You can do this in a Blaze component's `onCreated()` callback, like so:

```js
Template.Lists_show.onCreated(function() {
  this.autorun(() => {
    new SimpleSchema({
      list: {type: Function},
      todosReady: {type: Boolean},
      todos: {type: Mongo.Cursor}
    }).validate(Template.currentData());
  });
});
```

We use an `autorun()` here to ensure that the data context is re-validated whenever it changes.

<h3 id="name-data-contexts">Name data contexts to template inclusions</h3>

It's tempting to just provide the object you're interested in as the entire data context of the template (like `{% raw %}{{> Todos_item todo}}{% endraw %}`). It's better to explicitly give it a name (`{% raw %}{{> Todos_item todo=todo}}{% endraw %}`). There are two primary reasons for this:

1. When using the data in the sub-component, it's a lot clearer what you are accessing; `{% raw %}{{todo.title}}{% endraw %}` is clearer than `{% raw %}{{title}}{% endraw %}`.
2. It's more flexible, in case you need to give the component more arguments in the future.

For instance, in the case of the `Todos_item` sub-component, we need to provide two extra arguments to control the editing state of the item, which would have been a hassle to add if the item was used with a single `todo` argument.

Additionally, for better clarity, always explicitly provide a data context to an inclusion rather than letting it inherit the context of the template where it was rendered:

```html
<!-- bad: inherits data context, who knows what is in there! -->
{{> myTemplate}}

<!-- explicitly passes empty data context -->
{{> myTemplate ""}}
```

<h3 id="use-each-in">Prefer `{% raw %}{{#each .. in}}{% endraw %}`</h3>

For similar reasons to the above, it's better to use `{% raw %}{{#each todo in todos}}{% endraw %}` rather than the older `{% raw %}{{#each todos}}{% endraw %}`. The second sets the entire data context of its children to a single `todo` object, and makes it difficult to access any context from outside of the block.

The only reason not to use `{% raw %}{{#each .. in}}{% endraw %}` would be because it makes it difficult to access the `todo` symbol inside event handlers. Typically the solution to this is simply to use a sub-component to render the inside of the loop.

<h3 id="pass-data-into-helpers">Pass data into helpers</h3>

Rather than accessing data in helpers via `this`, it's better to pass the arguments in directly from the template. So our `checkedClass` helper takes the `todo` as an argument and inspects it directly, rather than implicitly using `this.todo`. We do this for similar reasons to why we always pass arguments to template inclusions, and because "template variables" (such as the iteratee of the `{% raw %}{{#each .. in}}{% endraw %}` helper) are not available on `this`.

<h3 id="use-template-instance">Use the template instance</h3>

Although Blaze's simple API doesn't necessarily encourage a componentized approach, you can use the *template instance* as a convenient place to store internal functionality and state. The template instance can be accessed via `this` inside Blaze's lifecycle callbacks and as `Template.instance()` in event handlers and helpers. It's also passed as the second argument to event handlers.

We suggest a convention of naming it `instance` in these contexts and assigning it at the top of every relevant helper. For instance:

```js
Template.Lists_show.helpers({
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

Template.Lists_show.events({
  'click .js-cancel'(event, instance) {
    instance.state.set('editing', false);
  }
});
```

<h3 id="reactive-dict-state">Use a reactive dict for state</h3>

The [`reactive-dict`](https://atmospherejs.com/meteor/reactive-dict) package lets you define a simple reactive key-value dictionary. It's a convenient way to attach internal state to a component. We create the `state` dictionary in the `onCreated` callback, and attach it to the template instance:

```js
Template.Lists_show.onCreated(function() {
  this.state = new ReactiveDict();
  this.state.setDefault({
    editing: false,
    editingTodo: false
  });
});
```

Once the state dictionary has been created we can access it from helpers and modify it in event handlers (see the code snippet above).

<h3 id="attach-functions-to-instance">Attach functions to the instance</h3>

If you have common functionality for a template instance that needs to be abstracted or called from multiple event handlers, it's sensible to attach it as functions directly to the template instance in the `onCreated()` callback:

```js
Template.Lists_show.onCreated(function() {
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
Template.Lists_show.events({
  'submit .js-edit-form'(event, instance) {
    event.preventDefault();
    instance.saveList();
  }
});
```

<h3 id="scope-dom-lookups-to-instance">Scope DOM lookups to the template instance</h3>

It's a bad idea to look up things directly in the DOM with jQuery's global `$()`. It's easy to select some element on the page that has nothing to do with the current component. Also, it limits your options on rendering *outside* of the main document (see testing section below).

Instead, Blaze gives you `instance.$()` which scopes a lookup to within the current template instance. Typically you use this either from a `onRendered()` callback to setup jQuery plugins, or from event handlers to call DOM functions directly. For instance, when the user clicks the add todo button, we want to focus the `<input>` element:

```js
Template.Lists_show.events({
  'click .js-todo-add'(event, instance) {
    instance.$('.js-todo-new input').focus();
  }
});
```

<h3 id="js-selectors-for-events">Use `.js-` selectors for event maps</h3>

When you are setting up event maps in your JS files, you need to 'select' the element in the template that the event attaches to. Rather than using the same CSS class names that are used to style the elements, it's better practice to use classnames that are specifically added for those event maps. A reasonable convention is a class starting with `js-` to indicate it is used by the JavaScript. For instance `.js-todo-add` above.

<h3 id="passing-template-content">Passing HTML content as a template argument</h3>

If you need to pass in content to a sub-component (for instance the content of a modal dialog), you can use the [custom block helper](#block-helpers) to provide a block of content. If you need more flexibility, typically just providing the component name as an argument is the way to go. The sub-component can then just render that component with:

```html
{{> Template.dynamic templateName dataContext}}
```

This is more or less the way that the [`kadira:blaze-layout`](https://atmospherejs.com/kadira/blaze-layout) package works.

<h3 id="pass-callbacks">Pass callbacks</h3>

If you need to communicate *up* the component hierarchy, it's best to pass a *callback* for the sub-component to call.

For instance, only one todo item can be in the editing state at a time, so the `Lists_show` component manages the state of which is edited. When you focus on an item, that item needs to tell the list's component to make it the "edited" one. To do that, we pass a callback into the `Todos_item` component, and the child calls it whenever the state needs to be updated in the parent:

```html
{{> Todos_item (todoArgs todo)}}
```

```js
Template.Lists_show.helpers({
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

Template.Todos_item.events({
  'focus input[type=text]'() {
    this.onEditing(true);
  }
});
```

<h3 id="onrendered-for-libs">Use `onRendered()` for 3rd party libraries</h3>

As we mentioned above, the `onRendered()` callback is typically the right spot to call out to third party libraries that expect a pre-rendered DOM (such as jQuery plugins). The `onRendered()` callback is triggered *once* after the component has rendered and attached to the DOM for the first time.

Occasionally, you may need to wait for data to become ready before it's time to attach the plugin (although typically it's a better idea to use a sub-component in this use case). To do so, you can setup an `autorun` in the `onRendered()` callback. For instance, in the `Lists_show_page` component, we want to wait until the subscription for the list is ready (i.e. the todos have rendered) before we hide the launch screen:

```js
Template.Lists_show_page.onRendered(function() {
  this.autorun(() => {
    if (this.subscriptionsReady()) {
      // Handle for launch screen defined in app-body.js
      AppLaunchScreen.listRender.release();
    }
  });
});
```

<h2 id="smart-components">Writing smart components with Blaze</h2>

Some of your components will need to access state outside of their data context---for instance, data from the server via subscriptions or the contents of client-side store. As discussed in the [data loading](data-loading.html#patterns) and [UI](ui-ux.html#smart-components) articles, you should be careful and considered in how use such smart components.

All of the suggestions about reusable components apply to smart components. In addition:

<h3 id="subscribing">Subscribe from `onCreated`</h3>

You should subscribe to publications from the server from an `onCreated` callback (within an `autorun` block if you have reactively changing arguments). In the Todos example app, in the `Lists_show_page` template we subscribe to the `Todos.inList` publication based on the current `_id` FlowRouter param:

```js
Template.Lists_show_page.onCreated(function() {
  this.getListId = () => FlowRouter.getParam('_id');

  this.autorun(() => {
    this.subscribe('Todos.inList', this.getListId());
  });
});
```

We use `this.subscribe()` as opposed to `Meteor.subscribe()` so that the component automatically keeps track of when the subscriptions are ready. We can use this information in our HTML template with the built-in `{% raw %}{{Template.subscriptionsReady}}{% endraw %}` helper or within helpers using `instance.subscriptionsReady()`.

Notice that in this component we are also accessing the global client-side state store `FlowRouter`, which we wrap in a instance method called `getListId()`. This instance method is called both from the `autorun` in `onCreated`, and from the `listIdArray` helper:

```js
Template.Lists_show_page.helpers({
  // We use #each on an array of one item so that the "list" template is
  // removed and a new copy is added when changing lists, which is
  // important for animation purposes.
  listIdArray() {
    const instance = Template.instance();
    const listId = instance.getListId();
    return Lists.findOne(listId) ? [listId] : [];
  },
});
```

<h3 id="fetch-in-smart-components">Fetch in helpers</h3>

As described in the [UI/UX article](ui-ux.html#smart-components), you should fetch data in the same component where you subscribed to that data. In a Blaze smart component, it's usually simplest to fetch the data in a helper, which you can then use to pass data into a reusable child component. For example, in the `Lists_show_page`:

```html
{{> Lists_show (listArgs listId)}}
```

The `listArgs` helper fetches the data that we've subscribed to above:

```js
Template.Lists_show_page.helpers({
  listArgs(listId) {
    const instance = Template.instance();
    return {
      todosReady: instance.subscriptionsReady(),
      // We pass `list` (which contains the full list, with all fields, as a function
      // because we want to control reactivity. When you check a todo item, the
      // `list.incompleteCount` changes. If we didn't do this the entire list would
      // re-render whenever you checked an item. By isolating the reactiviy on the list
      // to the area that cares about it, we stop it from happening.
      list() {
        return Lists.findOne(listId);
      },
      // By finding the list with only the `_id` field set, we don't create a dependency on the
      // `list.incompleteCount`, and avoid re-rendering the todos when it changes
      todos: Lists.findOne(listId, {fields: {_id: true}}).todos()
    };
  }
});

```

<h2 id="reusing-code">Reusing code in Blaze</h2>

It's common to want to reuse code between two otherwise unrelated components. There are two main ways to do this in Blaze.

<h3 id="composition">Composition</h3>

If possible, it's usually best to try and abstract out the reusable part of the two components that need to share functionality into a new, smaller component. If you follow the patterns for [reusable components](#reusable-components), it should be simple to reuse this sub-component everywhere you need this functionality.

For instance, suppose you have many places in your application where you need an input to blur itself when you click the "esc" key. If you were building an autocomplete widget that also wanted this functionality, you could compose a `blurringInput` inside your `autocompleteInput`:

```html
<template name="autocompleteInput">
  {{> blurringInput name=name value=currentValue onChange=onChange}}
</template>
```

```js
Template.autocompleteInput.helpers({
  currentValue() {
    // perform complex logic to determine the auto-complete's current text value
  },
  onChange() {
    // This is the `autocompleteInput`'s template instance
    const instance = Template.instance();
    // The second argument to this function is the template instance of the `blurringInput`.
    return (event) => {
      // read the current value out of the input, potentially change the value
    };
  }
});
```

By making the `blurringInput` flexible and reusable, we can avoid re-implementing functionality in the `autocompleteInput`.

<h3 id="libraries">Libraries</h3>

It's usually best to keep your view layer as thin as possible and contain a component to whatever specific task it specifically needs to do. If there's heavy lifting involved (such as complicated data loading logic), it often makes sense to abstract it out into a library that simply deals with the logic alone and doesn't deal with the Blaze system at all.

For example, if a component requires a lot of complicated [D3](http://d3js.org) code for drawing graphs, it's likely that that code itself could live in a separate module that's called by the component. That makes it easier to abstract the code later and share it between various components that need to all draw graphs.

<h3 id="global-helpers">Global Helpers</h3>

Another way to share commonly used view code is a global Spacebars helper. You can define these with the `Template.registerHelper()` function. Typically you register helpers to do simple things (like rendering dates in a given format) which don't justify a separate sub-component. For instance, you could do:

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

Blaze is intentionally opaque about re-rendering. Tracker and Blaze are designed as "eventual consistency" systems that end up fully reflecting any data change eventually, but may take a few re-runs or re-renders in getting there, depending on how they are used. This can be frustrating if you are trying to carefully control when your component is re-rendered.

The first thing to consider here is if you actually need to care about your component re-rendering. Blaze is optimized so that it typically doesn't matter if a component is re-rendered even if it strictly shouldn't. If you make sure that your helpers are cheap to run and consequently rendering is not expensive, then you probably don't need to worry about this.

The main thing to understand about how Blaze re-renders is that re-rendering happens at the level of helpers and template inclusions. Whenever the *data context* of a component changes, it necessarily must re-run *all* helpers and data accessors (as `this` within the helper is the data context and thus will have changed).

Additionally, a helper will re-run if any *reactive data source* accessed from within *that specific helper* changes.

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

If your helper or sub-component is expensive to run, and often re-runs without any visible effect, you can short circuit unnecessary re-runs by using a more subtle reactive data source. The [`peerlibrary:computed-field`](https://atmospherejs.com/peerlibrary/computed-field) package helps achieve this pattern.

<h3 id="attribute-helpers">Attribute helpers</h3>

Setting tag attributes via helpers (e.g. `<div {% raw %}{{attributes}}{% endraw %}>`) is a neat tool and has some precedence rules that make it more useful. Specifically, when you use it more than once on a given element, the attributes are composed (rather than the second set of attributes simply replacing the first). So you can use one helper to set one set of attributes and a second to set another. For instance:

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
});
```

<h3 id="lookups">Lookup order</h3>

Another complicated topic in Blaze is name lookups. In what order does Blaze look when you write `{% raw %}{{something}}{% endraw %}`? It runs in the following order:

1. Helper defined on the current component
2. Binding (eg. from `{% raw %}{{#let}}{% endraw %}` or `{% raw %}{{#each in}}{% endraw %}`) in current scope
3. Template name
4. Global helper
5. Field on the current data context

<h3 id="build-system">Blaze and the build system</h3>

As mentioned in the [build system article](build-tool.html#blaze), the [`blaze-html-templates`](https://atmospherejs.com/meteor/blaze-html-templates) package scans your source code for `.html` files, picks out `<template name="templateName">` tags, and compiles them into a JavaScript file that defines a function that implements the component in code, attached to the `Template.templateName` symbol.

This means when you render a Blaze template, you are simply running a function on the client that corresponds to the Spacebars content you defined in the `.html` file.

<h3 id="views">What is a view?</h3>

One of the most core concepts in Blaze is the "view", which a building block that represents a reactively rendering area of a template. The view is the machinery that works behind the scenes to track reactivity, do lookups, and re-render appropriately when data changes. The view is the unit of re-rendering in Blaze. You can even use the view tree to walk the rendered component hierarchy, but it's better to avoid this in favor of communicating between components using callbacks, template arguments, or global data stores.

You can read more about views in the [Blaze docs](http://docs.meteor.com/#/full/blaze_view).
