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


2. Creating reusable "pure" components with Blaze / best practice (a lot of this is repeating @sanjo's boilerplate)
  1. Validating data context fits a schema
  2. Always set data contexts to `{name: doc}` rather than just `doc`. Always set a d.c on an inclusion.
  3. Use `{{#each .. in .. }}` to achieve the above
  4. Use the template instance as a component -- adding a `{{instance}}` helper to access it
  5. Use a (named / scoped on `_id` if possible) reactive dict for instance state
  6. Attach functions to the template instance (in `onCreated`) to sensibly modify state
  7. Place `const instance = Template.instance()` at the top of all helpers/event handlers that care about state
  8. Always scope DOM lookups with `this.$`
  9. Use `.js-X` in event maps
  10. Pass extra content to components with `Template.contentBlock`, or named template arguments
  11. Use the `onRendered` callback to integrate w/ 3rd party libraries
    1. Waiting on subscriptions w/ `autorun` pattern: https://github.com/meteor/guide/pull/75/files#r43545240
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