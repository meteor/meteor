---
title: Code style
---

After reading this article, you'll know:

1. The benefits of having a consistent code style across your organization and the Meteor community
2. Meteor's recommended JavaScript code style
3. How to set up JavaScript linting for your code
4. How to name all of the different parts of a Meteor app

<h2 id="benefits-consistent-style">Benefits of consistent style</h2>

Countless hours have been spent by developers throughout the years arguing over single vs. double quotes, where to put brackets, how many spaces to type, and all kinds of other cosmetic code style questions. These are all questions that have at best a tangential relationship to code quality, but are very easy to have opinions about because they are so visual.

While it's not necessarily important whether your code base uses single or double quotes for string literals, there are huge benefits to making that decision once and having it be consistent across your organization. These benefits also apply to the Meteor and JavaScript development communities as a whole.

<h3 id="easy-to-read">Easy to read code</h3>

The same way that you don't read English sentences one word at a time, you don't read code one token at a time. Mostly you just look at the shape of a certain expression, or the way it highlights in your editor, and assume what it does. If the style of every bit of code is consistent, that ensures that bits of code that look the same actually _are_ the same - there isn't any hidden punctuation or gotchas that you don't expect, so you can focus on understanding the logic instead of the symbols. One example of this is indentation - while in JavaScript, indentation is not meaningful, it's helpful to have all of your code consistently indented so that you don't need to read all of the brackets in detail to see what is going on.

```js
// This code is misleading because it looks like both statements
// are inside the conditional.
if (condition)
  firstStatement();
  secondStatement();
```

```js
// Much clearer!
if (condition) {
  firstStatement();
}

secondStatement();
```

<h3 id="standard-tools">Use standard tools</h3>

Having a consistent style means that it's easier to adopt standard tools for error checking. For example, if you adopt a convention that you must always use `let` or `const` instead of `var`, you can now use a tool to ensure all of your variables are block-scoped. That means one less thing to thing about when reading code.

If your whole organization uses the same tool to check code, you can more easily read code written by anyone else. If we can standardize across the Meteor community, this will also be the case for open source projects and tutorials! In this article, we'll give suggestions for standard linter and transpiler configurations for Meteor.

<h3 id="code-samples">Use code samples directly</h3>

If you're using the standard Meteor style guide, you can more easily understand and copy code samples from the Meteor Guide, documentation, tutorials, example apps, and more, without having to reformat them first.

For the reasons above and more, we believe that the overall benefits of having a consistent style outweigh opinions on the individual decisions. For this reason, we've adopted a very popular JavaScript style guide from AirBnB basically as-is. We think the Meteor version is a bit clearer and removes some unnecessary content, but most things are the same.

<h2 id="javascript">JavaScript style</h2>

Here at Meteor, we strongly believe that JavaScript is the best language to build web applications, for a variety of reasons. JavaScript is constantly improving, and the standards around ES2015 have really brought together the JavaScript community. Here are our recommendations about how to use ES2015 JavaScript in your app today.

[XXX Ben's .gif of ecmascript here]

<h3 id="ecmascript">Use the `ecmascript` package</h3>

Meteor comes with a core package called `ecmascript` that transpiles all `.js` files in your app to support a stable list of modern JavaScript standards that are reliable for production use. This means that not all cutting-edge features, like function decorators or generators, are supported; we think it's best to only build your app on standards that are good bets for future browser support.

For a complete list of ES2015 features we support, consult the [`ecmascript` package README](https://atmospherejs.com/meteor/ecmascript).

<h3 id="style-guide">Follow the Meteor JavaScript style guide</h3>

We have a JavaScript style guide which is heavily based on the popular AirBnB style guide, but has been content edited to include only essential rules. If you would like to follow this style guide in your non-Meteor applications, you will need to enable the same Babel features as supported by the `ecmascript` package linked above.

[Read the Meteor JavaScript style guide.](https://github.com/meteor/javascript)

<h2 id="eslint">Check your code with ESLint</h2>

"Code linting" is the process of automatically checking your code for common errors or style problems. For example, ESLint can determine if you have made a typo in a variable name, or some part of your code is unreachable because of a poorly written `if` condition.

We have a standard ESLint configuration that verifies as much as possible of the Meteor JavaScript style guide.

[Get the Meteor `.eslintrc` here.](XXX)

Below, you can find directions for setting up automatic linting at many different stages of development. In general, you want to run the linter as often as possible, because it's the fastest and easiest way to identify typos and small errors.

<h3 id="eslint-installing">Installing and running ESLint</h3>

XXX do you need global NPM for this?

<h3 id="eslint-editor">Integrating ESLint with your editor</h3>

XXX

<h3 id="eslint-commit-hook">Setting up a commit hook for linting</h3>

XXX

<h3 id="eslint-ci">Running ESLint in your CI environment</h3>

XXX

<h2 id="meteor-features">Meteor features</h2>

The section above talked about JavaScript code in general - you can easily apply it in any JavaScript application, not just with Meteor apps. However, there are some style questions that are Meteor-specific, in particular how to name and structure all of the different components of your app.

<h3 id="collections">Collections</h3>

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

<h3 id="methods-and-publications">Methods and publications</h3>

Method and publication names should be camelCased and namespaced to a module or collection. For example, if you have a Method related to the Todos collection:

```js
// Naming a method
Todos.methods.updateText = new ValidatedMethod({
  name: 'Todos.methods.updateText',
  // ...
});
```

Note that this code sample uses the [ValidatedMethod package recommended in the Methods article](methods.html#XXX). If you aren't using that package, you can use the name as the property passed to `Meteor.methods`.

Here's how this naming convention looks when applied to a publication:

```js
// Naming a publication
Meteor.publish('Lists.public', function() {
  // ...
});
```

<h3 id="files-and-exports">Files, exports, and packages</h3>

You should use the ES2015 `import` and `export` features to manage your code. This will let you better understand the dependencies between different parts of your code, and it will be easy to know where to look if you need to read the source code of a dependency.

Each file in your app should represent one logical module. Avoid having catch-all utility modules that export a variety of unrelated functions and symbols. Often, this can mean that it's good to have one class, UI component, or collection per file, but there are cases where it is OK to make an exception, for example if you have a UI component with a small sub-component that isn't used outside of that file.

When a file represents a single class or UI component, the file should be named the same as the thing it defines, with the same capitalization. So if you have a file that exports a class:

```js
export class ClickCounter { ... }
```

This class should be defined inside a file called `ClickCounter.js`. When you import it, it'll look like this:

```js
import ClickCounter from './ClickCounter.js';
```

Note that imports use relative paths, and include the file extension at the end of the file name.

<h3 id="templates-and-components">Templates and components</h3>

Often when you are dealing with templates or UI components, you'll have several closely coupled files to manage. They could be two or more of HTML, CSS, and JavaScript. In this case, we recommend putting the files together in the same directory with the same name:

```
# The listShow template from the Todos example app has 3 files:
listShow.html
listShow.js
listShow.less
```

If you are writing your UI in React, you can do the same with the JSX and CSS for your component.
