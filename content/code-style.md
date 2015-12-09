# Code style

After reading this article, you'll know:

1. The benefits of having a consistent code style across your organization and all Meteor apps
2. Meteor's recommended JavaScript code style
3. How to set up JavaScript linting for your code
4. How to name all of the different parts of a Meteor app

## Benefits of consistent style

Countless hours have been spent by developers throughout the years arguing over single vs. double quotes, where to put brackets, how many spaces to type, and all kinds of other cosmetic code style questions. These are all questions that have at best a tangential relationship to code quality, but are very easy to have opinions about because they are so visual.

While it's not necessarily important whether your code base uses single or double quotes for string literals, there are huge benefits to making that decision once and having it be consistent across your organization. These benefits also apply to the Meteor and JavaScript development communities as a whole:

1. **It's easier to see what code is doing.** The same way that you don't read English sentences one word at a time, you don't read code one token at a time. Mostly you just look at the shape of a certain expression, or the way it highlights in your editor, and assume what it does. If the style of every bit of code is consistent, that ensures that bits of code that look the same actually _are_ the same - there isn't any hidden punctuation or gotchas that you don't expect, so you can focus on understanding the logic instead of the symbols. One example of this is indentation - while in JavaScript, indentation is not meaningful, it's helpful to have all of your code consistently indented so that you don't need to read all of the brackets in detail to see what is going on.
2. **It's easy to integrate linters, code checkers, and transpilers.** Having a consistent style means that it's easier to adopt standard tools for error checking. For example, if you adopt a convention that you must always use `let` or `const` instead of `var`, you can now use a tool to ensure all of your variables are block-scoped. That means one less thing to thing about when reading code. If your whole organization, and the entire Meteor community, can be using the same tool to check code, you can more easily read code written by anyone else, whether they are a different developer on your team, or an outside contributor to your open source project. In this article, we'll give suggestions for standard linter and transpiler configurations for Meteor.
3. **Code samples on the internet will follow the same style.** If you're using the standard Meteor style guide, you can more easily understand and copy code samples from the Meteor Guide, documentation, tutorials, example apps, and more, without having to reformat them first.

For the reasons above and more, we believe that the overall benefits of having a consistent style outweigh opinions on the individual decisions. For this reason, we've adopted a very popular JavaScript style guide from AirBnB basically as-is. We think the Meteor version is a bit clearer and removes some unnecessary content, but most things are the same.

## JavaScript code

Here at Meteor, we strongly believe that JavaScript is the best language to build web applications, for a variety of reasons. ES2015 is the best JavaScript we've ever had, and the standards around it has really brought together the JavaScript community. Here are our recommendations about how to use ES2015 JavaScript in your app today.

[Ben's .gif of ecmascript here]

### Use the `ecmascript` package

Meteor comes with a core package called `ecmascript` that transpiles all `.js` files in your app to support a list of modern JavaScript features that we believe are stable standards that you can use in production. This means that not all cutting-edge features, like function decorators or generators, are supported; we think it's best to only build your app on standards that are good bets for future browser support.

For a complete list of ES2015 features we support, consult the [`ecmascript` package README](https://atmospherejs.com/meteor/ecmascript).

If you would like to follow this style guide in your non-Meteor applications, you will need to enable the same Babel features as listed there.

### Follow the Meteor JavaScript style guide

We have a JavaScript style guide which is heavily based on the popular AirBnB style guide, but has been content edited to include only essential rules.

[Read the Meteor JavaScript style guide.](https://github.com/meteor/javascript)

### Lint your code with ESLint

"Code linting" is the process of automatically checking your code for common errors or style problems. For example, ESLint can determine if you have made a typo in a variable name, or some part of your code is unreachable because of a poorly written `if` condition.

We have a standard ESLint configuration that verifies as much as possible of the Meteor JavaScript style guide.

[Get the Meteor `.eslintrc` here.](XXX)

Below, you can find directions for setting up automatic linting at many different stages of development. In general, you want to run the linter as often as possible, because it's the fastest and easiest way to identify typos and small errors.

#### Installing and running ESLint

XXX do you need global NPM for this?

#### Integrating ESLint with your editor

XXX

#### Setting up a commit hook for linting

XXX

#### Running ESLint in your CI environment

XXX

## Meteor features

The section above talked about JavaScript code in general - you can easily apply it in any JavaScript application, not just with Meteor apps. However, there are some style questions that are Meteor-specific, in particular how to name and structure all of the different components of your app.

### Collections

Collections should be named as a plural noun, in PascalCase. The name of the collection in the database (the first argument to the collection constructor) should be the same as the name of the JavaScript symbol.

```js
// Defining a collection
Lists = new Mongo.Collection('Lists');
```

Fields in the database should be camelCased just like your JavaScript variable names.

```js
// Inserting a document with camelCased field names
Widgets.insert({
  myFieldName: 'Hello, world!',
  otherFieldName: 'Goodbye.'
});
```

### Methods and publications

Method and publication names should be camelCased and namespaced to a module or collection. For example, if you have a Method related to the Todos collection:

```js
// Naming a method
Todos.methods.updateText = new ValidatedMethod({
  name: 'Todos.methods.updateText',
  // ...
});
```

Note that this code sample uses the [ValidatedMethod package recommended in the Methods article](methods.html#XXX). If you aren't using that package, you can use the name as the property passed to `Meteor.methods`.

```js
// Naming a publication
Meteor.publish('Todos.')
```
