# Code Style

After reading this article, you'll know:

1. Why it's a good idea to have consistent code style
2. Which style guide we recommend for JavaScript code
3. How to set up ESLint to check code style automatically
4. Style suggestions for Meteor-specific patterns, such as Methods, publications, and more

## Benefits of consistent style

Countless hours have been spent by developers throughout the years arguing over single vs. double quotes, where to put brackets, how many spaces to type, and all kinds of other cosmetic code style questions. These are all questions that have at best a tangential relationship to code quality, but are very easy to have opinions about because they are so visual.

While it's not necessarily important whether your code base uses single or double quotes for string literals, there are huge benefits to making that decision once and having it be consistent across your organization.

### Easy to read code

The same way that you don't read English sentences one word at a time, you don't read code one token at a time. Mostly you just look at the shape of a certain expression, or the way it highlights in your editor, and assume what it does. If the style of every bit of code is consistent, that ensures that bits of code that look the same actually *are* the same—there isn't any hidden punctuation or gotchas that you don't expect, so you can focus on understanding the logic instead of the symbols.

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

### Automatic error checking

Having a consistent style means that it's easier to adopt standard tools for error checking. For example, if you adopt a convention that you must always use `let` or `const` instead of `var`, you can now use a tool to ensure all of your variables are scoped the way you expect. That means you can avoid bugs where variables act in unexpected ways. Also, by enforcing that all variables are declared before use, you can catch typos before even running any code!

### Deeper understanding

It's hard to learn everything about a programming language at once. For example, programmers new to JavaScript often struggle with the `var` keyword and function scope. Using a community-recommended coding style with automatic linting can warn you about these pitfalls proactively. This means you can jump right into coding without learning about all of the edge cases of JavaScript ahead of time.

## JavaScript style guide

Here at Meteor, we strongly believe that JavaScript is the best language to build web applications. JavaScript is constantly improving, and modern ES2015+ features have really brought together the JavaScript community.

### Use modern JavaScript

Meteor's `ecmascript` package compiles modern JavaScript down to regular JavaScript that all browsers can understand using the [Babel compiler](https://babeljs.io/). It's fully backwards compatible to "regular" JavaScript, so you don't have to use any new features if you don't want to.

The `ecmascript` package is included in all new apps and packages by default, and compiles all files with the `.js` file extension automatically.

Key modern JavaScript features to use:

- **Arrow functions**: `(x) => x * 2`
- **Async/await**: `async function getData() { await fetchData(); }`
- **Destructuring**: `const { name, email } = user;`
- **Template literals**: `` `Hello, ${name}!` ``
- **Modules**: `import { method } from './module';`
- **Classes**: `class MyClass extends BaseClass { }`
- **Spread operator**: `const newArray = [...oldArray, newItem];`

### Follow a JavaScript style guide

We recommend choosing and sticking to a JavaScript style guide and enforcing it with tools. A popular option that we recommend is the [Airbnb style guide](https://github.com/airbnb/javascript) with the ES6 extensions (and optionally React extensions).

## Check your code with ESLint

"Code linting" is the process of automatically checking your code for common errors or style problems. For example, ESLint can determine if you have made a typo in a variable name, or some part of your code is unreachable because of a poorly written `if` condition.

We recommend using the [Airbnb eslint configuration](https://github.com/airbnb/javascript/tree/master/packages/eslint-config-airbnb) which verifies the Airbnb styleguide.

### Installing and running ESLint

To setup ESLint in your application, install the following npm packages:

```bash
meteor npm install --save-dev eslint @meteorjs/eslint-config-meteor eslint-plugin-meteor
```

For React projects, add React-specific plugins:

```bash
meteor npm install --save-dev eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y
```

::: tip
Meteor comes with npm bundled so that you can type `meteor npm` without worrying about installing it yourself.
:::

### Configuration

Create an `.eslintrc.json` file in your project root or add an `eslintConfig` section to your `package.json`:

```json
{
  "extends": "@meteorjs/eslint-config-meteor",
  "env": {
    "browser": true,
    "node": true
  },
  "rules": {
    "no-console": "warn"
  }
}
```

Add lint scripts to your `package.json`:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "pretest": "npm run lint --silent"
  }
}
```

To run the linter:

```bash
meteor npm run lint
```

### Modern ESLint flat config

ESLint 9+ uses a new flat config format. Here's an example `eslint.config.js`:

```js
import js from '@eslint/js';
import meteorPlugin from 'eslint-plugin-meteor';

export default [
  js.configs.recommended,
  {
    plugins: {
      meteor: meteorPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        Meteor: 'readonly',
        Package: 'readonly',
        Npm: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
```

### Integrating with your editor

Linting is the fastest way to find potential bugs in your code. Running a linter is usually faster than running your app or your unit tests, so it's a good idea to run it all the time.

#### Visual Studio Code

1. Install the [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Search for "ESLint: Enable ESLint"

Add to your VS Code settings for automatic fixing on save:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

#### WebStorm

WebStorm has built-in ESLint support:

1. Go to Settings > Languages & Frameworks > JavaScript > Code Quality Tools > ESLint
2. Select "Automatic ESLint configuration"
3. Enable "Run eslint --fix on save"

#### Sublime Text

Install these packages through Package Control:

- SublimeLinter
- SublimeLinter-eslint

## Meteor code style

The section above talked about JavaScript code in general. However, there are some style questions that are Meteor-specific, in particular how to name and structure all of the different components of your app.

### Collections

Collections should be named as a plural noun, in PascalCase. The name of the collection in the database (the first argument to the collection constructor) should be the same as the name of the JavaScript symbol.

```js
// Defining a collection
export const Lists = new Mongo.Collection('lists');
```

Fields in the database should be camelCased just like your JavaScript variable names:

```js
// Inserting a document with camelCased field names
await Widgets.insertAsync({
  myFieldName: 'Hello, world!',
  otherFieldName: 'Goodbye.',
  createdAt: new Date()
});
```

### Methods and publications

Method and publication names should be camelCased, and namespaced to the module they are in:

```js
// in imports/api/todos/methods.js
import { createMethod } from 'meteor/jam:method';

export const updateText = createMethod({
  name: 'todos.updateText',
  schema: new SimpleSchema({
    todoId: { type: String },
    newText: { type: String }
  }),
  async run({ todoId, newText }) {
    // ...
  }
});
```

For classic Meteor methods:

```js
Meteor.methods({
  async 'todos.updateText'({ todoId, newText }) {
    // ...
  }
});
```

Here's how this naming convention looks when applied to a publication:

```js
// Naming a publication
Meteor.publish('lists.public', function listsPublic() {
  return Lists.find({ userId: { $exists: false } });
});
```

### Async patterns

In Meteor 3, always use async/await patterns:

```js
// Good - async patterns
Meteor.methods({
  async 'items.create'(data) {
    const id = await Items.insertAsync(data);
    return id;
  },

  async 'items.update'(id, changes) {
    await Items.updateAsync(id, { $set: changes });
  }
});
```

```js
// Avoid - sync patterns (deprecated in Meteor 3)
Meteor.methods({
  'items.create'(data) {
    const id = Items.insert(data); // Deprecated
    return id;
  }
});
```

### Files, exports, and packages

You should use the ES2015 `import` and `export` features to manage your code. This will let you better understand the dependencies between different parts of your code, and it will help you navigate to the source code of a dependency.

Each file in your app should represent one logical module. Avoid having catch-all utility modules that export a variety of unrelated functions and symbols.

When a file represents a single class or UI component, the file should be named the same as the thing it defines, with the same capitalization:

```js
// ClickCounter.js
export default class ClickCounter {
  // ...
}
```

When you import it:

```js
import ClickCounter from './ClickCounter.js';
```

For Atmosphere packages, you'll use named exports:

```js
// You'll need to destructure here
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
```

### React components

Name React components using PascalCase, with one component per file:

```jsx
// TodoItem.jsx
import React from 'react';

export function TodoItem({ todo, onToggle }) {
  return (
    <li onClick={() => onToggle(todo._id)}>
      <span className={todo.checked ? 'completed' : ''}>
        {todo.text}
      </span>
    </li>
  );
}
```

Use hooks for state and side effects:

```jsx
// TodoList.jsx
import React from 'react';
import { useSubscribe, useFind } from 'meteor/react-meteor-data';
import { Todos } from '/imports/api/todos/todos';
import { TodoItem } from './TodoItem';

export function TodoList({ listId }) {
  const isLoading = useSubscribe('todos.inList', listId);
  const todos = useFind(() => Todos.find({ listId }), [listId]);

  if (isLoading()) {
    return <div>Loading...</div>;
  }

  return (
    <ul>
      {todos.map(todo => (
        <TodoItem key={todo._id} todo={todo} />
      ))}
    </ul>
  );
}
```

### Blaze templates

Since Spacebars templates are global and need to have names that are completely unique across the whole app, we recommend naming your Blaze templates with the full path to the namespace, separated by underscores:

```html
<template name="Lists_show">
  ...
</template>
```

If this template is a "smart" component that loads server data and accesses the router, append `_page` to the name:

```html
<template name="Lists_show_page">
  ...
</template>
```

Often when you are dealing with templates or UI components, you'll have several closely coupled files to manage:

```
imports/ui/lists/
├── show.html
├── show.js
└── show.css
```

### Directory structure

Organize your code by feature rather than by type:

```
imports/
├── api/
│   ├── todos/
│   │   ├── todos.js          # Collection definition
│   │   ├── methods.js        # Methods
│   │   ├── publications.js   # Publications
│   │   └── schema.js         # Schema definition
│   └── lists/
│       ├── lists.js
│       ├── methods.js
│       └── publications.js
├── ui/
│   ├── components/           # Reusable components
│   │   ├── Button.jsx
│   │   └── Loading.jsx
│   ├── pages/                # Page components
│   │   ├── HomePage.jsx
│   │   └── TodoPage.jsx
│   └── layouts/
│       └── MainLayout.jsx
└── startup/
    ├── client/
    │   └── index.js
    └── server/
        └── index.js
```

## TypeScript considerations

If using TypeScript, follow these additional conventions:

```typescript
// Use interfaces for object types
interface Todo {
  _id: string;
  text: string;
  checked: boolean;
  listId: string;
  createdAt: Date;
}

// Use type for unions and intersections
type TodoStatus = 'pending' | 'completed' | 'archived';

// Export types alongside values
export interface CreateTodoParams {
  text: string;
  listId: string;
}

export async function createTodo(params: CreateTodoParams): Promise<string> {
  return await Todos.insertAsync({
    ...params,
    checked: false,
    createdAt: new Date()
  });
}
```

## Prettier integration

For automatic code formatting, combine ESLint with Prettier:

```bash
meteor npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier
```

Update your `.eslintrc.json`:

```json
{
  "extends": [
    "@meteorjs/eslint-config-meteor",
    "plugin:prettier/recommended"
  ]
}
```

Create a `.prettierrc` file:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

## Summary

1. **Use modern JavaScript** - Take advantage of ES2015+ features like async/await, destructuring, and modules.
2. **Follow a style guide** - The Airbnb style guide is a popular choice.
3. **Use ESLint** - Catch errors and enforce style automatically.
4. **Integrate with your editor** - Get immediate feedback as you code.
5. **Be consistent** - Whatever conventions you choose, apply them consistently.
6. **Use async/await** - Meteor 3 uses async patterns throughout.
7. **Organize by feature** - Group related files together.
