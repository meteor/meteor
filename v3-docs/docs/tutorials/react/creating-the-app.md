## 1: Creating the app

### Install Meteor {#install-meteor}

First, we need to install Meteor.

If you don't have Meteor installed, you can install it by running:

```shell
npx meteor
```

### Create Meteor Project {#create-meteor-project}

The easiest way to setup Meteor with React is by using the command `meteor create` with the option `--react` and your project name (you can also omit the `--react` option since it is the default):

```shell
meteor create simple-todos-react
```

Meteor will create all the necessary files for you.

The files located in the `client` directory are setting up your client side (web), you can see for example `client/main.jsx` where Meteor is rendering your App main component into the HTML.

Also, check the `server` directory where Meteor is setting up the server side (Node.js), you can see the `server/main.js` is initializing your MongoDB database with some data. You don't need to install MongoDB as Meteor provides an embedded version of it ready for you to use.

You can now run your Meteor app using:

```shell
meteor run
```

Don't worry, Meteor will keep your app in sync with all your changes from now on.

Your React code will be located inside the `imports/ui` directory, and `App.jsx` file is the root component of your React To-do app.

Take a quick look at all the files created by Meteor, you don't need to understand them now but it's good to know where they are.

### Create Task Component {#create-task-component}

You will make your first change now. Create a new file called `Task.jsx` in your `ui` folder.

This file will export a React component called `Task` that will represent one task in your To-Do list.

::: code-group

```js [imports/ui/Task.jsx]
import React from "react";

export const Task = ({ task }) => {
  return <li>{task.text}</li>;
};
```

:::

As this component will be inside a list you are returning a `li` element.

### Create Sample Tasks {#create-sample-tasks}

As you are not connecting to your server and your database yet let's define some sample data which will be used shortly to render a list of tasks. It will be an array, and you can call it `tasks`.

::: code-group

```js [imports/ui/App.jsx]
import React from 'react';

const tasks = [
  {_id: 1, text: 'First Task'},
  {_id: 2, text: 'Second Task'},
  {_id: 3, text: 'Third Task'},
];

export const App = () => ...
```

:::

You can put anything as your `text` property on each task. Be creative!

### Render Sample Tasks {#render-sample-tasks}

Now we can implement some simple rendering logic with React. We can now use our previous `Task` component to render our list items.

In React you can use `{` `}` to write Javascript code between them.

See below that you will use a `.map` function from the `Array` object to iterate over your sample tasks.

::: code-group

```js [imports/ui/App.jsx]
import React from 'react';
import { Task } from './Task';

const tasks = ..;

export const App = () => (
  <div>
    <h1>Welcome to Meteor!</h1>

    <ul>
      { tasks.map(task => <Task key={ task._id } task={ task }/>) }
    </ul>
  </div>
);
```

:::

Remember to add the `key` property to your task, otherwise React will emit a warning because it will see many components of the same type as siblings. Without a key, it will be hard for React to re-render one of them if necessary.

> You can read more about React and Keys [here](https://reactjs.org/docs/lists-and-keys.html#keys).

Remove the `Hello` and `Info` from your `App` component, remember to also remove the imports for them at the top of the file. Remove the `Hello.jsx` and `Info.jsx` files as well.

### Hot Module Replacement {#hot-module-replacement}

Meteor by default when using React is already adding for you a package called `hot-module-replacement`. This package updates the javascript modules in a running app that were modified during a rebuild. Reduces the feedback cycle while developing so you can view and test changes quicker (it even updates the app before the build has finished). You are also not going to lose the state, your app code will be updated and your state will be the same.

In the next step, we are going to work with our MongoDB database to store our tasks.
