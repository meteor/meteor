# Blaze changes

:::tip

It is important to note that migrating your front-end code to async is unnecessary.
You can still use the sync MongoDB methods on the client side,
for example: `Collection.fetch`/`Collection.findOne`.

:::

It is important to note that migrating your front-end code to async is unnecessary.
You can still use the sync methods on the client side.

But to maintain isomorphic code, you can use the async methods on the client side.

Since this [PR](https://github.com/meteor/blaze/pull/413) was released with Blaze 2.7. Blaze supports async in their views.

You can check the [Blaze docs](https://www.blazejs.org/api/spacebars#Async-states) for
more information on how to handle async states.

[@radekmie](https://github.com/radekmie) made two great posts about making Blaze async. Both are worth reading:
  - [On Asynchronicity in Blaze](https://radekmie.dev/blog/on-asynchronicity-in-blaze/);
  - [On Asynchronicity in Blaze (again)](https://radekmie.dev/blog/on-asynchronicity-in-blaze-again/);


Below you can check some examples of how to use async in Blaze, docs for this api are [here](https://www.blazejs.org/api/spacebars#Async-states)

## Simple example with states

::: code-group

```handlebars [profile.html]
{{#let name=getNameAsynchronously}}
  {{#if @pending 'name'}}
    We are fetching your name...
  {{/if}}
  {{#if @rejected 'name'}}
    Sorry, an error occured!
  {{/if}}
  {{#if @resolved 'name'}}
    Hi, {{name}}!
  {{/if}}
{{/let}}
```

```js [profile.js]
Template.profile.helpers({
  getNameAsynchronously() {
    return Meteor.callAsync("getName");
  }
});
```

:::

## Example with async lists

You can use let to handle async state while loading and iterating lists:

::: code-group

```handlebars [user_list.html]

{{#let users=getUsersAsync}}
  {{#if @pending 'users'}}
    We are fetching your list...
  {{/if}}
  {{#if @rejected 'users'}}
    Sorry, an error occured!
  {{/if}}
  {{if @resolved 'users'}}
    {{#each user in users}}
      Hi {{user.name}}!
    {{/each}}
  {{/if}}
{{/let}}

```

```js [user_list.js]

Template.user_list.helpers({
  getUsersAsync() {
    return Meteor.callAsync("getUsers"); // returns a Promise<Array>
  }
});


```
:::

If you just want to iterate and if there is nothing to show, you can use `else`:

::: code-group

```handlebars [profile.html]
{{#each user in getUsersAsync}}
  {{user}}.
{{else}}
  Pending, rejected, or resolved and empty.
{{/if}}
```

```js [profile.js]

Template.profile.helpers({
  getUsersAsync() {
    return Meteor.callAsync("getUsers"); // returns a Promise<Array>
  }
});

```

:::

## Example with async `if` and `unless`

For handling with falsy or truthy values, you can use `if` and `unless`,
note that it will not render anything until it resolves the promise:

::: code-group

```handlebars [profile.html]
{{#if isOkAsync}}
  Resolved and truthy.
{{else}}
  Resolved and falsy.
{{/if}}
```

```js [profile.js]

Template.profile.helpers({
  isOkAsync() {
    return Meteor.callAsync("condition"); // returns a Promise<Boolean>
  }
});

```
:::

Same goes for `unless`:

::: code-group

```handlebars [profile.html]
{{#unless isOkAsync}}
  Resolved and falsy.
{{else}}
  Resolved and truthy.
{{/unless}}
```

```js [profile.js]

Template.profile.helpers({
  isOkAsync() {
    return Meteor.callAsync("condition"); // returns a Promise<Boolean>
  }
});

```
:::
