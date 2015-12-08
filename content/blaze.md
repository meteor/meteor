---
title: Blaze
---

After reading this guide, you'll know:

1. How to use the Spacebars syntax, used to define Blaze templates.
2. Best practice towards creating reusable components in Blaze.
3. How the Blaze rendering engine works under the hood and some techniques to best use it.
4. How to test Blaze templates.

Blaze is Meteor's built in reactive rendering library. Using templates written in [Spacebars](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md), a variant of [Handlebars](http://handlebarsjs.com) designed to take advantage of [Tracker](https://github.com/meteor/meteor/tree/devel/packages/tracker), Meteor's reactivity system.

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

In this example, the template is rendered with an object with key `todo` as data context (we'll see below how to enforce that). We access the properties of the `todo`  using the mustache tag, such as `{{todo.text}}`. The default behaviour is to render that property as a string; however in some cases (such as `checked=={{todo.checked}}` it can be resolved as a boolean value).

Note that simple string interpolations like this will never render HTML---so you don't need to perform safety checks for XSS.

Additionally we can see an example of a *template helper*---`{{checkedClass}}` calls out to the `checkedClass` helper defined in a separate JavaScript file on the `todosItem` template:

```js
Template.todosItem.helpers({
  checkedClass() {
    return this.todo.checked && 'checked';
  }
});
```

In the context of a template helper, `this` is scoped to the the *data context* of the template.

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
 - Template inclusion `{{> todosItem (todoArgs todo)}}` which renders the `todosItem` template with a set data context, based on the output of the `todosArg` helper.

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
You "include" a subtemplate with the `{{>` syntax. By default, the sub-template will gain the data context of the caller, although it's usually a good idea to be explicit. You can provide a single object as argument (as we did with the object returned by the `todoArgs` helper above), or provide a list of keyword arguments, as the `listShowPage` template does:

```html
{{> listsShow todosReady=Template.subscriptionsReady
  list=(getFullList listIdOnly) todos=listIdOnly.todos}}
```

In this case, the `listShow` template can expect a data context of the form:

```js
{
  todosReady: ...,
  list: ...,
  todos: ...
}
```

<h3 id="helpers-in-tags">Helpers in tags</h3>
We saw above that using a helper (or data context lookup) in the form `checked={{todo.checked}}` will add the checked property to the HTML tag if `todo.checked` evaluates to true. Also, you can directly include an object as part of an HTML to apply multiple properties at once:

```html
<a {{attributes}}>My Link</a>
```

// XXX: can we find an example of this in Todos?

```js
Template.foo.helpers({
  attributes: () => {
    return {
      class: 'A class',
      style: {background: 'blue'}
    };
  }
});
```

<h3 id="rendering-html">Rendering pure HTML</h3>
Although by default a mustance tag won't render any HTML, for XSS security reasons, you can render pure HTML with the triple-mustache: `{{{`.

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
A block helper, called with `{{#` is a helper that takes (and may render) a block of Spacebars. For instance, we saw the `{{#each in}}` helper above which repeats a given block of Spacebars once per item in a list. You can also render a *template* as a block helper, rendering it's content via the `Template.contentBlock` and `Template.eachBlock`. For instance, you could create your own `{{#if}}` helper with:

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
```

<h3 id="builtin-block-helpers">Builtin Block Helpers</h3>
There are a few builtin block helpers that are worth knowing about:

<h4 id="if-unless">If / Unless</h4>

The `{{#if}}` and `{{#unless}}` helpers are fairly straightforward but invaluable for controlling the content generated by a template. Both operate by evaluating and checking their single argument for "falsey"-ness (in JS this means `null`, `undefined`, `0`, `''`, `[]` and of course `false`).

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

In this case `todo` will be added to the data context within the block, but all the existing data context items (`list` and `todosReady` in this case) will remain available.

<h4 id="let">Let</h4>
The `{{#let}}` helper is useful to capture the output of a helper or document subproperty within a template:

```html
{{#let name=person.bio.firstName color=generateColor}}
  <div>{{name}} gets a {{color}} card!</div>
{{/let}}
```

XXX: what to do about d.c. changing helpers such as with/each?

<h4 id="strictness">Strictness</h4>
Spacebars starts from a very strict interpretation of HTML. In particular you need to careful about self-closing tags and when you are allowed to use them. For instance, you can't self-close a `div` (`<div/>`) in Spacebars.

<h4 id="escaping">Escaping</h4>
To insert a literal {{, {{{, or any number of curly braces, put a vertical bar after it. So `{{|` will show up as `{{`, `{{{|` will show up as `{{{`, and so on.

<h2 id="reusable">Creating reusable components in Blaze</h2>
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

By placing the check in an `autorun()` we ensure that even if the data contexts reactively changes, it always fits the expected schema.

<h3 id="name-data-contexts">Name data contexts to template inclusions</h3>
It's tempting to provide the data context of a sub-template as a "raw" object (like `{{> todosItem todo}}`), it's a better idea to explicitly give it a name (`{{> todosItem todo=todo}}`). There are two primary reasons for this:

1. When using the data in the sub-template, it's a lot clearer what you are accessing `{{todo.title}}` is clearer than `title`.
2. It's more flexible, in case in future you need to provide more arguments to the template.

  For instance, in the case of the `todosItem` sub-template, we need to provide two extra arguments to control the editing state of the item, which would have been a hassle to add if the item was used with a raw `todo` argument.

Additionally, for similar reasons of clarity, always explicitly provide a data context to an inclusion, rather than letting it passively "fall-through".

<h3 id="use-each-in">Prefer `{{#each .. in}}`</h3>
For similar reasons to the above, it's better to use `{{#each todo in todos}}` rather than the older `{{#each todos}}`. The second sets the data context of it's internals to a raw `todo`, and makes it difficult to access the containing template's other data context. 

The only reason not to use `{{#each .. in}}` because it makes it difficult to access the `todo` symbol inside event handlers. Typically the solution to this is simply to use a sub-component to render the inside of the loop.

<h3 id="use-template-instance">Use the template instance</h3>
Although Blaze doesn't currently have a fully baked component model, you can use the *template instance* as a convenient place to modularize functionality. The template instance is `this` inside template lifecycle callbacks and can be accessed in event handlers and helpers as `Template.instance()`. It's also passed as second argument to event handlers.

We suggest a convention of naming it `instance` in these contexts and assigning it at the top of every relevant helper. For instance:

```js
Template.listsShow.helpers({
  todoArgs(todo) {
    const instance = Template.instance();
    return {
      todo,
      editing: instance.state.equals('editingTodo', todo._id),
      onEdit(doEdit) {
        instance.state.set('editingTodo', doEdit ? todo._id : false);
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
      err && alert(err.error); // XXX i18n
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
If you need to pass in content to a sub-template (for instance the content of a modal dialog), you can use the [custom block helper](#block-helpers) to provide a block of content. If you need more flexibility, typically just providing a named template a data context is the way to go. The sub-template can then just render that template with

```html
{{> Template.dynamic templateName dataContext}}
```

This is more or less the way that the [`kadira:blaze-layout`](https://atmospherejs.com/kadira/blaze-layout) package works in practice.

<h3 id="pass-callbacks">Pass callbacks</h3>
If you need to communicate *up* the template hierarchy, it's best to pass a *callback* for the subtemplate to call.

For instance, only one todo item can be currently in the editing state at a time, so the `listsShow` template manages the state of which is edited. So when you focus on an item, that item needs to tell the list's template to make it the "edited" one. To do that, we pass a callback into the `todosItem` template, and it calls it:

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
      onEdit(doEdit) {
        instance.state.set('editingTodo', doEdit ? todo._id : false);
      }
    };
  }
});

Template.todosItem.events({
  'focus input[type=text]'() {
    this.onEdit(true);
  }
});
```

<h3 id="onrendered-for-libs">Use `onRendered()` to callout to 3rd party libraries</h3>
As we mentioned above, the `onRendered()` callback is typically the right spot to call out to third party libraries that expect a pre-rendered DOM (such as jQuery plugins). The `onRendered()` callback is triggered *once* after the template is rendered and attached to the DOM for the first time.

Occasionally, you may need to wait for data to become ready before it's time to attach the plugin (although typically it's a better idea to use a sub-template in this use case). To do so, you can setup an `autorun` in the `onRendered()` callback. For instance, in the `listShowPage` template, we want to wait until the subscription for the list is ready (i.e. the todos have rendered) before we hide the launch screen:

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

3. Writing "smart" components with Blaze
  1. All of section 2.
  2. Use `this.autorun` and `this.subscribe`, listening to `FlowRouter` and `this.state`
  3. Set up cursors in helpers to be passed into pure sub-components, and filtered with `cursor-utils`
    1. Why cursors are preferred to arrays.
  4. Access stores directly from helpers.
4. Reusing code between templates
  1. Prefer utilities/composition to mixins or inheritance
  2. How to write global helpers
5. Understanding Blaze
  1. When does a template re-render (when its data context changes)
  2. When does a helper-rerun? (when its data context or reactive deps change)
    1. So be careful, this can happen a lot! If your helper is expensive, consider something like https://github.com/peerlibrary/meteor-computed-field
  3. How does an each tag re-run / decide when new data should appear?
    1. How does the `{{attrs}` syntax work, some tricks on how to use it.
  4. How do name lookups work?
  5. What does the build system do exactly?
  6. What is a view?
6. Testing Blaze templates
  1. Rendering a template in a unit test
  2. Querying the DOM (general but just a pointer here)
  3. Triggering reactivity and waiting for re-rendering
  4. Simulating events w/ JQ
7. Useful Blaze utilities / other approaches
  1. https://github.com/peerlibrary/meteor-blaze-components
  2. https://github.com/raix/Meteor-handlebar-helpers
  3. Much, much more...