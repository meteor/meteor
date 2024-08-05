# Meteor.js 3 + Vue Tutorial

In this tutorial, we will create a simple To-Do app using [Vue 3](https://vuejs.org/) and Meteor 3.0. Meteor works well with other frameworks like [Blaze](https://www.blazejs.org/), [React](https://react.dev/), [Solid](https://www.solidjs.com/), and [Svelte](https://svelte.dev/).

Vue.js is a powerful JavaScript framework for making user interfaces. It helps you build interactive applications by using templates that connect to data and update automatically when the data changes. Vue.js templates use a simple syntax similar to HTML and work with Vue’s reactivity system to show components in the browser.

To start building your Vue.js app, you'll need a code editor. If you're unsure which one to choose, [Visual Studio Code](https://code.visualstudio.com/) is a good option. After installing it, you can enhance your experience by adding extensions like [Meteor Toolbox](https://marketplace.visualstudio.com/items?itemName=meteor-toolbox.meteor-toolbox) and [Vue Language Features](https://marketplace.visualstudio.com/items?itemName=Vue.volar).

Let’s begin building your app!

# Table of Contents

[[toc]]

## 1: Creating the app

### 1.1: Install Meteor.js

First, ensure you have Node.js version 20 installed. You can install the latest version of Meteor by using the command:

```shell
npx meteor
```

If you encounter any issues, please refer to the requirements and details in [our documentation](https://v3-docs.meteor.com/about/install.html).


### 1.2: Create a Meteor.js Project

To set up Meteor with Vue easily, run the following command, replacing `simple-todos-vue` with your chosen project name:

```shell
meteor create --vue simple-todos-vue --release=3.0.2
```

Meteor will create all the necessary files for you. The `--vue` flag generates a project using Vue, Vite and Tailwind CSS.

You will find the `client` directory contains files for your client-side setup. Inside, there should be an empty `main.js` file required for Meteor's import mode. However, with Vite, the entry point is set in the `vite.config.js` file, pointing to `imports/ui/main.js`, which is where Meteor renders the main component.

Check the server directory for the server setup where you will see `server/main.js` populating your MongoDB database with some default data. There's no need to install MongoDB separately, as Meteor includes an embedded version.

To run your app, use:

```shell
meteor npm run start
```

Your Vue code will be located in the `imports/ui directory`, with `App.vue` as the root component of your app.

Take a moment to explore the files created by Meteor. You don’t have to understand everything right away, but it helps to know where they are.


### 1.3: Cleaning the UI Folder


Let's remove some unnecessary files for a cleaner start. Keep only `App.vue`, `main.js`, and `router.js` in the `imports/ui` folder. Delete the following files: `About.vue`, `AppMenu.vue`, `Hello.vue`, `Home.vue`, and `Info.vue`.

Next, update `router.js` to remove references to the deleted components:

::: code-group
```javascript [imports/ui/router.js]
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: App,
    },
  ],
});
```
:::

This file is where you set up your routes and decide which component to render for each path.

Also, update the App component since some components no longer exist.

::: code-group
```vue [imports/ui/App.vue]
<template>
  <div class="p-8">
    <h1>Hello Meteor</h1>
  </div>
</template>
```
:::

### 1.4: Creating Sample Tasks


We’ll create our Vue components in the `imports/ui/components` folder. Start by making this folder and adding a file named `Task.vue` inside it.

This file will export a Vue component called `Task`, representing an individual task in your To-Do list.


::: code-group
```vue [imports/ui/components/Task.vue]
<script setup>
defineProps({
  task: {
    type: Object,
    required: true,
  },
});
</script>

<template>
  <li>{{ task.text }}</li>
</template>
```
:::

Since the `Task` component will be part of a list, it returns a `li` element.

For now, we won’t connect to our database, so define some sample data in the `App.vue` file to display a list of tasks. Create an array and a function to return this array.


::: code-group
```vue [imports/ui/App.vue]
<script setup>
import Task from './components/Task.vue'

const getTasks = () => {
    return [
      { _id: 1, text: 'Install Node.js 20' },
      { _id: 2, text: 'Install Meteor 3' },
      { _id: 3, text: 'Create and run your project' },
    ];
}
</script>

<template>
  <div class="p-8">
    <h1>Hello Meteor</h1>
  </div>
</template>
```
:::

### 1.5: Rendering Tasks


Now let's add some simple rendering logic with Vue to display our list items using the `Task` component.

Update the template of the `App` component to include the list of tasks:


::: code-group
```vue [imports/ui/App.vue]
<script setup>
import Task from './components/Task.vue'

const getTasks = () => {
    return [
      { _id: 1, text: 'Install Node.js 20' },
      { _id: 2, text: 'Install Meteor 3' },
      { _id: 3, text: 'Create and run your project' },
    ];
}
</script>
<template>
  <div class="container">
    <header>
      <h1 class="text-4xl font-bold text-gray-800 my-4">Todo List</h1>
    </header>
    <ul class="list-disc list-inside p-4">
      <Task v-for="task in getTasks()" :key="task._id" :task="task" />
    </ul>
  </div>
</template>
```
:::

For more information on Vue iterations, you can read [here](https://vuejs.org/api/built-in-directives.html#v-for).

In the next step, we will connect to the MongoDB database to store our tasks.


## 2: Collections


Meteor already sets up MongoDB for you. In order to use our database we need to create a *collection*, which is where we will store our *documents*, in our case our `tasks`.
You can read more about collections [here](http://guide.meteor.com/collections.html).


In this step we will implement all the necessary code to have a basic collection for our tasks up and running.

### 2.1: Create Tasks Collection


Before creating our collection, let's remove the `links.js` file from the `imports/api`  folder because we won't use it. Now, you can create a new collection to store our tasks by creating a new file named `TasksCollection.js` inside the `imports/api` folder.


::: code-group
```javascript [imports/api/TasksCollection.js]
import { Mongo } from 'meteor/mongo';
 
export const TasksCollection = new Mongo.Collection('tasks');
```
:::

The code above instantiates a new MongoDB collection and exports it. You can read more about app structure and imports/exports [here](https://guide.meteor.com/structure.html).

### 2.2: Initialize Tasks Collection


To make our collection work, you need to import it on the server to set things up.

You can use import `'./imports/api/TasksCollection'` or `import { TasksCollection } from './imports/api/TasksCollection'` if you plan to use `TasksCollection` in the same file. Just make sure it's imported.

Now, it’s easy to check if there is data in our collection, or we can easily add some sample data.

Replace the old content in `server/main.js` with the code below.

::: code-group
```javascript [server/main.js]
import { Meteor } from 'meteor/meteor';
import { TasksCollection } from '../imports/api/TasksCollection';

const insertTask = async text => await TasksCollection.insertAsync({text});

Meteor.startup(async () => {
  const tasksCount = await TasksCollection.find().countAsync();
  if (tasksCount === 0) {
    await insertTask('First Task');
    await insertTask('Second Task');
    await insertTask('Third Task');
    await insertTask('Fourth Task');
    await insertTask('Fifth Task');
    await insertTask('Sixth Task');
    await insertTask('Seventh Task');
  }
});
```
:::

So you are importing the `TasksCollection` and adding a few tasks on it calling a function to insert this string as our `text` field in our `task` document.

### 2.3: Render Tasks Collection


Now comes the fun part, you will render the tasks using a “data container” to feed Meteor’s reactive data into Vue’s component hierarchy. We will use the [vue-meteor-tracker](https://www.npmjs.com/package/vue-meteor-tracker) package for this.

::: info
Meteor works with Meteor packages and NPM packages, usually Meteor packages are using Meteor internals or other Meteor packages.
:::

The `vue-meteor-tracker` package is already included in the Vue skeleton, so you don’t need to add it.

When importing code from a Meteor package the only difference from NPM modules is that you need to prepend `meteor/` in the from part of your import.  
First we need to implement a subscription at the `App` component to get the tasks updated from the server. It can be done simply by using the `subscribe` and `autorun` functions from `vue-meteor-tracker`.

::: info
The `vue-meteor-tracker` package doesn't support async calls yet, so we need to use sync functions. This is not an issue, but it's important to know.
:::


::: code-group
```vue [imports/ui/App.vue]
<script setup>
import Task from './components/Task.vue';
import { subscribe, autorun } from 'vue-meteor-tracker';
import { TasksCollection } from '../api/TasksCollection';

subscribe('tasks');
const tasks = autorun(() => TasksCollection.find({}).fetch()).result;
</script>

<template>
  <div class="container">
    <header>
      <h1 class="text-4xl font-bold text-gray-800 my-4">Todo List</h1>
    </header>
    <ul class="list-disc list-inside p-4">
      <Task v-for="task of tasks" :key="task._id" :task="task" />
    </ul>
  </div>
</template>
```
:::

To be able to fetch data in the client, you need to publish it in the server. To do it, create a file called `tasksPublications.js` and add the following code:


::: code-group
```javascript [imports/api/tasksPublications.js]
import { Meteor } from 'meteor/meteor';
import { TasksCollection } from './TasksCollection';

Meteor.publish('tasks', function publishTasks() {
    return TasksCollection.find();
});
```
:::

Now, import it on the server:


::: code-group
```javascript [server/main.js]
import '../imports/api/tasksPublications';
```
:::

> If you want to learn more about how publications works, you can read the [Meteor Guide](https://docs.meteor.com/api/pubsub.html).

Now, your app should look like this:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/step02-task-list.png)

You can change your data on MongoDB in the server and your app will react and re-render for you.

You can connect to your MongoDB running `meteor mongo` in the terminal from your app folder or using a MongoDB UI client, like [NoSQLBooster](https://nosqlbooster.com/downloads) or [MongoDB Compass](https://www.mongodb.com/products/tools/compass). Your embedded MongoDB is running in the port `3001`.

See how to connect:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step02/nosql-new-connection.png)

See your database:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step02/nosql-connection-editor.png)

You can double-click your collection to see the documents stored on it:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step02/nosql-tasks-query.png)

## 3: Forms and Events


Now, we need to let users interact with the stored data. In our case, the first interaction is to add new tasks. One of the main ways in which a user can insert or edit data in a website is through forms, using the `<form>` tag.

### 3.1: Create Task Form


First, we need to create a simple form component to encapsulate our logic.

Create a new file `TaskForm.vue` in your `ui/components` folder.


::: code-group
```vue [imports/ui/components/TaskForm.vue]
<script setup>
import { ref } from 'vue';

const newTask = ref('');

const addTask = () => {
  console.log(newTask.value);
}
</script>

<template>
    <form @submit.prevent="addTask">
        <input
            v-model="newTask"
            class=" border border-gray-300 rounded-md py-2 px-4 mr-2 text-gray-600 text-sm focus:outline-none focus:border-gray-400 focus:ring-0"
            type="text" placeholder="Type to add new tasks" />
        <button class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded" type="submit">Add Task</button>
    </form>
</template>
```
:::

This form will have an input element that has a `v-model` attribute. The `newTask` data field will now be bound via two-way binding to the input element’s value.

You can see that the form element has a `@submit.prevent` attribute. This will call the `addTask` method, which will print the text to the console when the form is submitted. The `@` symbol is a shorthand for `v-on:`. The prevent modifier stops the form's default behavior, which is to reload the page.

### 3.2: Update the App component


Then we can simply add this to our `App` component above your list of tasks:


::: code-group
```vue [imports/ui/App.vue]
<script setup>
import Task from './components/Task.vue';
import TaskForm from './components/TaskForm.vue';
import { subscribe, autorun } from 'vue-meteor-tracker';
import { TasksCollection } from '../api/TasksCollection';

subscribe('tasks');
const tasks = autorun(() => TasksCollection.find({}).fetch()).result;
</script>

<template>
  <div class="container">
    <header>
      <h1 class="text-4xl font-bold text-gray-800 my-4">Todo List</h1>
    </header>
    <TaskForm />
    <ul class="list-disc list-inside p-4">
      <Task v-for="task of tasks" :key="task._id" :task="task" />
    </ul>
  </div>
</template>
```
:::

### 3.3: Add Insert Operation


Now you can edit the `addTask` function to insert a new task into the database. To do it, we will need to implement a Meteor Method.

Methods are essentially RPC calls to the server that let you perform operations on the server side securely. You can read more about Meteor Methods [here](https://guide.meteor.com/methods.html).

To create your methods, you can create a file called `tasksMethods.js`.


::: code-group
```javascript [imports/api/tasksMethods.js]
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { TasksCollection } from './TasksCollection';

async function insertTask(text) {
    check(text, String);
    return await TasksCollection.insertAsync({
        text,
        createdAt: new Date,
    });
}

Meteor.methods({ insertTask });
```
:::

Remember to import your method on the `main.js` server file.


::: code-group
```javascript [server/main.js]
import { Meteor } from 'meteor/meteor';
import { TasksCollection } from '../imports/api/TasksCollection';
import './imports/api/tasksPublications';
import '../imports/api/tasksMethods';
```
:::

Now, we can call this method from our `TaskForm.vue` component.


::: code-group
```vue [imports/ui/components/TaskForm.vue]
<script setup>
import { ref } from 'vue';
import { Meteor } from 'meteor/meteor';

const newTask = ref('');

const addTask = async () => {
  await Meteor.callAsync('insertTask', newTask.value.trim());
  newTask.value = '';
}
</script>
```
:::

Inside the function, we are adding a task to the `tasks` collection by calling `Meteor.callAsync()`. The first argument is the name of the method we want to call, and the second argument is the text of the task. We are also trimming the text to remove any extra spaces.

### 3.5: Show Newest Tasks First


Now, you just need to make a change which will improve user experience: we will show the newest tasks first. We can accomplish this quickly by sorting our [MongoDB](https://guide.meteor.com/collections.html#mongo-collections) query.


::: code-group
```javascript [imports/ui/App.vue]
...

const tasks = autorun(() => {
  return TasksCollection.find({}, { sort: { createdAt: -1 } }).fetch();
}).result;

...
```
:::

Your app should look like this:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step03/newest-task.png)

## 4: Update and Remove

Until now, you have only inserted documents to our collection. Let’s see how you can update and remove them using the user interface.


### 4.1: Add Checkbox


First, you need to add a `checkbox` element to your `Task` component, and we need to add the `v-model` directive to the checkbox. This will allow us to bind the value of the checkbox to the `checked` field of the task document.  
To do this, we need to add a `ref` to the task document. This will allow us to access the task document in the template. And add a computed property `isChecked` for the state management of the checkbox.

We also have a prop called `task` that is passed to the component. This prop is an object that represents the task document.


::: code-group
```vue [imports/ui/components/Task.vue]
<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  task: {
    type: Object,
    required: true,
  },
});

const taskRef = ref({ ...props.task }); // Create a reactive copy of the task

const isChecked = computed(() => taskRef.value.checked);

</script>

<template>
  <div class="flex items-center rounded px-4 py-2 mb-2">
    <li>
      <input v-model="taskRef.checked" type="checkbox" :checked="isChecked" @change="handleCheckboxChange" />
    </li>
    <span class="text-gray-600 pl-2" :class="{ 'text-gray-400 italic line-through': taskRef.checked }">
      {{ task.text }}
    </span>
  </div>
</template>
 ..
```
:::

### 4.2: Toggle Checkbox


We need to implement the method to update the task document. So, update the `tasksMethods.js` file with the following code:


::: code-group
```javascript [imports/api/tasksMethods.js]
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { TasksCollection } from './TasksCollection';

async function insertTask(text) {
    check(text, String);
    return await TasksCollection.insertAsync({
        text,
        createdAt: new Date,
    });
}

async function removeTask(taskId) {
    check(taskId, String);
    await TasksCollection.removeAsync(taskId);
}

async function setIsCheckedTask(taskId, checked) {
    check(taskId, String);
    check(checked, Boolean);

    await TasksCollection.updateAsync(taskId, {
        $set: {
            checked
        }
    });
}

Meteor.methods({ insertTask, removeTask, setIsCheckedTask });
```
:::

The `updateAsync` function on a collection takes two arguments. The first is a selector that identifies a subset of the collection, and the second is an update parameter that specifies what should be done to the matched objects.

In this case, the selector is just the `_id` of the relevant task. The update parameter uses `$set`, on our method, to toggle the `checked` field, which will represent whether the task has been completed.

On the client side, you need to add a function to handle the checkbox change event. This method updates the local `taskRef.checked` state and handles the Meteor call to update the task's checked status. It encapsulate any logic you want to perform when the checkbox is checked or unchecked.


::: code-group
```vue [imports/ui/components/Task.vue]
<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
    task: {
      type: Object,
      required: true,
    },
});

const taskRef = ref({ ...props.task });

const isChecked = computed(() => taskRef.value.checked);

const handleCheckboxChange = async (event) => {
    const newCheckedValue = event.target.checked;
    taskRef.value.checked = newCheckedValue;
    
    try {
      await Meteor.callAsync('setIsCheckedTask', taskRef.value._id, newCheckedValue);
    } catch (error) {
      console.error('Error updating task checked state:', error);
    }
};
</script>

<template>
  <div class="flex items-center rounded px-4 py-2 mb-2">
    <li>
      <input v-model="taskRef.checked" type="checkbox" :checked="isChecked" @change="handleCheckboxChange" />
    </li>
    <span class="text-gray-600 pl-2" :class="{ 'text-gray-400 italic line-through': taskRef.checked }">
      {{ task.text }}
    </span>
  </div>
</template>
```
:::

Your app should look like this:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step04/checked-tasks.png)

### 4.3: Remove tasks


You can remove tasks with just a few lines of code.

First add a button after the text in your `Task` component and receive a callback function.

::: code-group
```vue [imports/ui/components/Task.vue]
...
<span class="text-gray-600 pl-2" :class="{ 'text-gray-400 italic line-through': taskRef.checked }">
  {{ task.text }}
</span>

<button 
    class="ml-auto bg-red-500 hover:bg-red-600 text-white font-bold py-0.5 px-2 rounded"
    @click="deleteTask"> &times; 
</button>
...
```
:::

Now add the removal logic into methods:


::: code-group
```javascript [imports/ui/components/Task.vue]
...
const deleteTask = async () => {
  try {
    await Meteor.callAsync('removeTask', taskRef.value._id);
  } catch (error) {
    console.error('Error deleting task:', error);
  }
};
...
```
:::

Your app should look like this:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step04/remove-button.png)

## 5: Styles


### 5.1: Tailwind CSS


Our user interface has not looked great so far. Let’s add some basic styling to create a foundation for a more professional app. We'll start with the App component.


::: code-group
```vue [imports/ui/App.vue]
<template>
  <header class="flex items-center justify-between px-4 py-4 bg-gray-100 border-t border-b border-gray-200">
    <h1 class="text-4xl font-bold text-gray-800 my-4">🚀 To-Do List</h1>
  </header>
  <div class="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
    <div class="mb-8 md:w-96 md:mx-auto md:mb-0 md:mt-8 md:px-4 md:py-8 text-center md:bg-gray-100 md:rounded-lg">
      <TaskForm />
      <ul class="list-none list-inside pt-4 md:w-96">
        <Task v-for="task of tasks" :key="task._id" :task="task" />
      </ul>
    </div>
  </div>
</template>
```
:::

> Flexbox is an excellent tool to distribute and align elements in your UI. Check this [article](https://tailwindcss.com/docs/) to learn more about [Tailwind CSS](https://tailwindcss.com/), the CSS framework we are using in this tutorial.

We’ll also update the `TaskForm` component and the `Task` component.


::: code-group
```vue [imports/ui/components/TaskForm.vue]
<template>
  <form @submit.prevent="addTask">
    <input
        v-model="newTask"
        class=" border border-gray-300 rounded-md py-2 px-4 mr-2 text-gray-600 text-sm focus:outline-none focus:border-gray-400 focus:ring-0"
        type="text" placeholder="Type to add new tasks" />
    <button class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-4 rounded" type="submit">Add Task</button>
  </form>
</template>
```

```vue [imports/ui/components/Task.vue]
<template>
  <div class="flex items-center rounded p-4 py-2 mb-2 shadow-sm border border-gray-200 md:mr-8">
    <li>
      <input v-model="taskRef.checked" type="checkbox" readonly :checked="taskRef.checked" />
    </li>
    <span class="text-gray-600 pl-2" :class="{ 'text-gray-400 italic line-through': taskRef.checked }">
      {{ task.text }}
    </span>
    <button class="ml-auto bg-red-500 hover:bg-red-600 text-white font-bold py-0.5 px-2 rounded" @click="deleteTask">
      &times;
    </button>
  </div>
</template>
```
:::

Your app should look like this:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step05/new-ui.png)

In the next step we will make this task list more interactive providing a way to filter tasks.


## 6: Filter tasks


In this step you will filter your tasks by status and show the quantity of pending tasks.

### 6.1: Filter tasks


First, you will add a button to show or hide the completed tasks from the list:


::: code-group
```vue [imports/ui/App.vue]
<div class="mb-8 md:w-96 md:mx-auto md:mb-0 md:mt-8 md:px-4 md:py-8 text-center md:bg-gray-100 md:rounded-lg">
    <TaskForm />
    <div>
      <button class="text-sm font-semibold text-gray-600 hover:text-gray-800" @click="toggleHideCompleted">
        <span v-if="hideCompleted">Show all</span>
        <span v-else>Hide completed</span>
      </button>
    </div>
    <ul class="list-none list-inside pt-4 md:w-96">
      <Task v-for="task of tasks" :key="task._id" :task="task" />
    </ul>
</div>
```
:::

You can see that it reads from `hideCompleted`. We’ll need to initialize the value of `hideCompleted` using `ref` in the script section:


::: code-group
```javascript [imports/ui/App.vue]
...
import { ref } from 'vue';

const hideCompleted = ref(false);

subscribe('tasks');
...
```
:::

We can update `hideCompleted` from an event handler directly, which will then cause the component to re-render:

::: code-group
```javascript [imports/ui/App.vue]
...
const toggleHideCompleted = () => {
  hideCompleted.value = !hideCompleted.value
};
</script>
...
```
:::

Now, we need to update the list of tasks to filter out completed tasks when `hideCompleted` is `true`.

`imports/ui/App.vue`

```javascript
...

subscribe('tasks');

const tasks = autorun(() => {
  const filter = hideCompleted.value ? { checked: { $ne: true } } : {};
  return TasksCollection.find(filter, { sort: { createdAt: -1 } }).fetch();
}).result;

...
```


Mark a few tasks as completed so you can check the filter behaviour.

### 6.2: Pending tasks


Update the App component in order to show the number of pending tasks in the app bar.

You should avoid adding zero to your app bar when there are no pending tasks.


::: code-group
```vue [imports/ui/App.vue]
<script setup>
... 
const incompleteTasksCount = autorun(() => {
  return TasksCollection.find({ checked: { $ne: true } }).count();
}).result;
...
</script>

<template>
...
  <h1 class="text-4xl font-bold text-gray-800 my-4">🚀 To-Do List
    <span v-if="incompleteTasksCount > 0" class="text-xl font-light text-gray-600">({{ incompleteTasksCount }})</span>
  </h1>
...
</template>
```
:::

At this point, your app should look like this:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step06/showing-all.png)


## 7: Adding User Accounts


### 7.1: Password Authentication


Meteor already comes with authentication and account management system out of the box, so you only need to add the `accounts-password` package to enable username and password authentication:

```shell
meteor add accounts-password
```

> There are many more authentication methods supported. You can read more about the accounts system [here](https://docs.meteor.com/api/accounts.html).



We also recommend you to install `bcrypt` node module, otherwise you are going to see a warning saying that you are using pure-Javascript implementation of it.

```shell
meteor npm install --save bcrypt
```

> You should always use `meteor npm` instead of only `npm` so you always use the `npm` version pinned by Meteor, this helps you to avoid problems due to different versions of npm installing different modules.


### 7.2: Create User Account


Now, you can create a default user for our app. We will create a new user when the server starts if we don’t find one in the database. Let's make specific functions for user creation and task creation, and then call both in `Meteor.startup()`.


::: code-group
```javascript [server/main.js]
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { TasksCollection } from '../imports/api/TasksCollection';
import '../imports/api/tasksPublications';
import '../imports/api/tasksMethods';

const SEED_USERNAME = 'meteorite';
const SEED_PASSWORD = 'password';

const createFirstUser = async () => {
  const user = await Accounts.findUserByUsername(SEED_USERNAME);
  if (!user) {
    await Accounts.createUserAsync({
      username: SEED_USERNAME,
      password: SEED_PASSWORD,
    });
  }
}

const insertTask = async text => await TasksCollection.insertAsync({text});

const createTasks = async () => {
  const tasksCount = await TasksCollection.find().countAsync();
  if (tasksCount === 0) {
    await insertTask('First Task');
    await insertTask('Second Task');
    await insertTask('Third Task');
    await insertTask('Fourth Task');
    await insertTask('Fifth Task');
    await insertTask('Sixth Task');
    await insertTask('Seventh Task');
  }
}

Meteor.startup(async () => {
  await createFirstUser();
  await createTasks();
});
```
:::

You should not see anything different in your app UI yet.

### 7.3: Login Form


You need to give users a way to enter their credentials and log in. For this, we need a form.

Create a new file called `LoginForm.vue` and add a form to it. Use `Meteor.loginWithPassword(username, password)` to log in the user with the provided information.


::: code-group
```vue [imports/ui/components/LoginForm.vue]
<script setup>
import { Meteor } from 'meteor/meteor';
import { ref } from 'vue';

const username = ref('');
const password = ref('');

const login = () => {
  Meteor.loginWithPassword(username.value, password.value);
}
</script>

<template>
  <form class="flex flex-col justify-center items-center w-full max-w-md mx-auto my-8" @submit.prevent="login">
    <div>
      <label for="username" class="block text-gray-700 text-sm font-bold mb-2">Username</label>
      <input v-model="username" type="text" name="username" placeholder="Username" required
             class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline">
    </div>

    <div class="mt-4">
      <label for="password" class="block text-gray-700 text-sm font-bold mb-2">Password</label>
      <input v-model="password" type="password" name="password" placeholder="Password" required
             class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline">
    </div>

    <div>
      <button type="submit"
              class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 mt-4 px-4 rounded focus:outline-none focus:shadow-outline">
        Log in
      </button>
    </div>
  </form>
</template>
```
:::

### 7.4: Require Authentication


Our app should only let authenticated users access the task management features.

We can achieve this by showing the `LoginForm` component when there is no authenticated user. If the user is logged in, we will show the tasks list.

We’ll need a `ref` to check if the user is logged in, a `userId` variable to store user data, and some logic using `watch` to update the `isLogged` `ref` when the user changes.


::: code-group
```javascript [imports/ui/App.vue]
...
import { Meteor } from 'meteor/meteor';
import { ref, watch } from 'vue';

const hideCompleted = ref(false);
const isLogged = ref(false);

const userId = autorun(() => Meteor.userId()).result;

watch(
  () => userId.value,
  (newUser) => {
    isLogged.value = !!newUser
  },
  { immediate: true }
);
...
```
:::

Next, we can wrap our user features in a `<div>` tag and use the `v-if` directive to show these features only when a user is logged in:


::: code-group
```vue [imports/ui/App.vue]
<script setup>
...
import LoginForm from './components/LoginForm.vue';
...
</script>

<template>
  <div v-if="isLogged">
    <header class="flex items-center justify-between px-4 py-4 bg-gray-100 border-t border-b border-gray-200">
      <h1 class="text-4xl font-bold text-gray-800 my-4">🚀 To-Do List
        <span v-if="incompleteTasksCount > 0" class="text-lg font-light text-gray-600">({{ incompleteTasksCount }})</span>
      </h1>
    </header>
    <div class="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="mb-8 md:w-96 md:mx-auto md:mb-0 md:mt-8 md:px-4 md:py-8 text-center md:bg-gray-100 md:rounded-lg">
        <TaskForm />
        <div>
          <button class="text-sm font-semibold text-gray-600 hover:text-gray-800" @click="toggleHideCompleted">
            <span v-if="hideCompleted">Show all</span>
            <span v-else>Hide completed</span>
          </button>
        </div>
        <ul class="list-none list-inside pt-4 md:w-96">
          <Task v-for="task of tasks" :key="task._id" :task="task" />
        </ul>
      </div>
    </div>
  </div>

  <div v-else>
    <LoginForm />
  </div>
</template>
```
:::

### 7.5: Server startup


From now on, every task must have an owner. Please go to your database and remove all the tasks:

`db.tasks.remove({});`

Then, update your `server/main.js` to add the seed tasks with your `meteoriote` user as the owner.


::: code-group
```javascript [server/main.js]
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { TasksCollection } from '../imports/api/TasksCollection';
import '../imports/api/tasksPublications';
import '../imports/api/tasksMethods';

const SEED_USERNAME = 'meteorite';
const SEED_PASSWORD = 'password';

const createFirstUser = async () => {
  const user = await Accounts.findUserByUsername(SEED_USERNAME);
  if (!user) {
    await Accounts.createUserAsync({
      username: SEED_USERNAME,
      password: SEED_PASSWORD,
    });
  }
}

const insertTask = async (text, userId) => {
  await TasksCollection.insertAsync({text, userId, createdAt: new Date()});
}

const createTasks = async () => {
  const tasksCount = await TasksCollection.find().countAsync();
  if (tasksCount === 0) {
    const user = await Accounts.findUserByUsername(SEED_USERNAME);

    await insertTask('First Task', user._id);
    await insertTask('Second Task', user._id);
    await insertTask('Third Task', user._id);
    await insertTask('Fourth Task', user._id);
    await insertTask('Fifth Task', user._id);
    await insertTask('Sixth Task', user._id);
    await insertTask('Seventh Task', user._id);
  }
}

Meteor.startup(async () => {
  await createFirstUser();
  await createTasks();
});
```
:::

See that we are using a new field called `userId` with our user `_id` field, we are also setting `createdAt` field.

Go to the tasks publication and add the `userId` to the find selector, so users will be able to see only their own tasks.


::: code-group
```javascript [imports/api/tasksPublications.js]
import { Meteor } from 'meteor/meteor';
import { TasksCollection } from '../db/TasksCollection';

Meteor.publish('tasks', function publishTasks() {
  return TasksCollection.find({ userId: Meteor.userId() });
});
```
:::

Before testing, make sure to restart the server after making this change so that the `Meteor.startup` block runs again. This will likely happen automatically since you're changing the server-side code.

### 7.7: Task owner


Tasks are filtered by their owner in the publication using the authenticated user, but we should also filter the tasks in the UI. Use the user's `_id` to add the `userId` field to your MongoDB selector when retrieving tasks from Minimongo.

Your `tasks` function should look like this:


::: code-group
```vue [imports/ui/App.vue]
<script setup>
...
const userId = autorun(() => Meteor.userId()).result;

watch(
    () => userId.value,
    (newUserId) => {
      isLogged.value = !!newUserId
    },
    { immediate: true }
);

subscribe('tasks');

const tasks = autorun(() => {
  const filter = hideCompleted.value ? { checked: { $ne: true }, userId: userId.value } : { userId: userId.value };
  return TasksCollection.find(filter, { sort: { createdAt: -1 } }).fetch();
}).result;

const incompleteTasksCount = autorun(() => {
  return TasksCollection.find({ checked: { $ne: true }, userId: userId.value }).count()
}).result;

...
</script>
```
:::

### 7.8: Log out


We can include a new `button` right after our `h1`. On this button you can add an `onClick` handler to logout the user. It is very straightforward, just call `Meteor.logout()` on it.


::: code-group
```vue [imports/ui/App.vue]
<script setup>
...
const logout = () => Meteor.logout();
...
</script>

<h1 class="text-4xl font-bold text-gray-800 my-4">🚀 To-Do List
  <span v-if="incompleteTasksCount > 0" class="text-xl font-light text-gray-600">({{ incompleteTasksCount }})</span>
</h1>

<button
  class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
  @click="logout">
      Logout
</button>
...
```
:::

Now that we have authentication, we can add a check on the server side to ensure only logged-in users can delete, update, or add new tasks.

We can do this by adding the code below to each on `tasksMethods`:


```javascript
if (!Meteor.userId()) {
 throw new Meteor.Error('Not authorized.');
}
```


Follow how your `tasksMethods` should look like:


::: code-group
```javascript [/imports/api/tasksMethods.js]
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { TasksCollection } from './TasksCollection';

async function insertTask(text) {
    check(text, String);
    if (!Meteor.userId()) {
        throw new Meteor.Error('Not authorized.');
    }
    return await TasksCollection.insertAsync({
        text,
        userId: Meteor.userId(),
        createdAt: new Date,
    });
}

async function removeTask(taskId) {
    check(taskId, String);
    if (!Meteor.userId()) {
        throw new Meteor.Error('Not authorized.');
    }
    await TasksCollection.removeAsync(taskId);
}

async function setIsCheckedTask(taskId, checked) {
    check(taskId, String);
    check(checked, Boolean);

    if (!Meteor.userId()) {
        throw new Meteor.Error('Not authorized.');
    }
    
    await TasksCollection.updateAsync(taskId, {
        $set: {
            checked
        }
    });
}

Meteor.methods({ insertTask, removeTask, setIsCheckedTask });
```
:::

Phew! You have done quite a lot in this step. Authenticated the user, set the user in the tasks and provided a way for the user to log out.

Your app should look like this:

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step07/login-page.png)

![image](https://vue3-tutorial.meteor.com/simple-todos/assets/new-screenshots/step07/logged-page.png)


## 8: Deploying

Deploying a Meteor application is similar to deploying any other Node.js app that uses websockets. You can find deployment options in [our guide](https://guide.meteor.com/deployment), including Meteor Up, Docker, and our recommended method, Galaxy.

In this tutorial, we will deploy our app on [Galaxy](https://www.meteor.com/hosting), which is our own cloud solution. Galaxy offers a free plan, so you can deploy and test your app. Pretty cool, right?


### 8.1: Create your account


You need a Meteor account to deploy your apps. If you don’t have one yet, you can [sign up here](https://cloud.meteor.com/?isSignUp=true).
With this account, you can access our package manager, [Atmosphere](https://atmospherejs.com/), [Forums](https://forums.meteor.com/) and more.



### 8.2: Set up MongoDB (Optional)


As your app uses MongoDB the first step is to set up a MongoDB database, Galaxy offers MongoDB hosting on a free plan for testing purposes, and you can also request for a production ready database that allows you to scale.

In any MongoDB provider you will have a MongoDB URL which you must use it. If you use the free option provided by Galaxy, the initial setup is done for you.

Galaxy MongoDB URL will be like this: `mongodb://username:<password>@org-dbname-01.mongodb.galaxy-cloud.io` .
> You can read more about Galaxy MongoDB [here](https://galaxy-guide.meteor.com/galaxy-database-mongodb-general) and general MongoDB set up [here](https://galaxy-guide.meteor.com/mongodb.html).


### 8.3: Set up settings


You need to create a setting file, it’s a JSON file that Meteor apps can read configurations from. Create this file in a new folder called `private` in the root of your project. It is important to notice that `private` is a special folder that is not going to be published to the client side of your app.

Make sure you replace `Your MongoDB URL` by your own MongoDB URL :)


::: code-group
```json [private/settings.json]
{
  "galaxy.meteor.com": {
    "env": {
      "MONGO_URL": "Your MongoDB URL"
    }
  }
}
```
:::

### 8.4: Deploy it


Now you are ready to deploy, run `meteor npm install` before deploying to make sure all your dependencies are installed.

You also need to choose a subdomain to publish your app. We are going to use the main domain `meteorapp.com` that is free and included on any Galaxy plan.

In this example we are going to use `vue3-meteor-3.meteorapp.com` but make sure you select a different one, otherwise you are going to receive an error.


> You can learn how to use custom domains on Galaxy [here](https://galaxy-guide.meteor.com/custom-domains.html). Custom domains are available starting with the Essentials plan.


Run the deployment command:

```shell
meteor deploy vue3-meteor-3.meteorapp.com --free --mongo
```

> If you are not using the free hosting with MongoDB on Galaxy, then remove the `--mongo` flag from the deploy script and add `--settings private/settings.json` with the proper setting for your app.


Make sure you replace `vue3-meteor-3` by a custom name that you want as subdomain. You will see a log like this:

```shell
meteor deploy vue3-meteor-3.meteorapp.com --settings private/settings.json
Talking to Galaxy servers at https://us-east-1.galaxy-deploy.meteor.com
Preparing to build your app...                
Preparing to upload your app... 
Uploaded app bundle for new app at vue-tutorial.meteorapp.com.
Galaxy is building the app into a native image.
Waiting for deployment updates from Galaxy... 
Building app image...                         
Deploying app...                              
You have successfully deployed the first version of your app.
For details, visit https://galaxy.meteor.com/app/vue3-meteor-3.meteorapp.com
```


This process usually takes just a few minutes, but it depends on your internet speed as it’s going to send your app bundle to Galaxy servers.

> Galaxy builds a new Docker image that contains your app bundle and then deploy containers using it, [read more](https://galaxy-guide.meteor.com/container-environment.html).

You can check your logs on Galaxy, including the part that Galaxy is building your Docker image and deploying it.

### 8.5: Access the app and enjoy


Now you should be able to access your Galaxy dashboard at `https://galaxy.meteor.com/app/vue3-meteor-3.meteorapp.com`.

You can also access your app on Galaxy 2.0 which is currently in beta at `https://galaxy-beta.meteor.com/<your-username>/us-east-1/apps/<your-app-name>.meteorapp.com`. Remember to use your own subdomain instead of `vue3-meteor-3`.

You can access the app at [vue3-meteor-3.meteorapp.com](https://vue3-meteor-3.meteorapp.com/)! Just use your subdomain to access yours!

> We deployed to Galaxy running in the US (us-east-1), we also have Galaxy running in other regions in the world, check the list [here](https://galaxy-guide.meteor.com/deploy-region.html).

This is huge, you have your app running on Galaxy, ready to be used by anyone in the world!

## 9: Next Steps

You have completed the tutorial!

By now, you should have a good understanding of working with Meteor and Vue.

Here are some options for what you can do next:

- Check out the complete [documentation](https://v3-docs.meteor.com/) to learn more about Meteor 3.
- Read the [Galaxy Guide](https://galaxy-guide.meteor.com/) to learn more about deploying your app.
- Join our community on the [Meteor Forums](https://forums.meteor.com/) and the [Meteor Lounge on Discord](https://discord.gg/hZkTCaVjmT) to ask questions and share your experiences.

We can't wait to see what you build next!