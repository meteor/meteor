# React Native Integration

React Native has grown to be one of the most popular platforms for building native apps, being used by companies like Tesla, Instagram, and Facebook in production. React Native allows you to write apps in JavaScript that are rendered with native code. It has many of the features that you value when working with Meteor, like instant refresh on save.

After reading this guide, you'll know:

1. How to set up a React Native project with Meteor
2. How to connect React Native to your Meteor server
3. How to use Meteor's data layer in React Native
4. How to use Meteor Accounts in React Native

## Overview

You can easily integrate your React Native app with Meteor, using the same methods you would on a Meteor + React Web app. The integration supports most Meteor features, including Methods, Pub/Sub, and Password Accounts, and has the same usage as `react-meteor-data`.

## Getting started with React Native

React Native projects are coded using the same React principles, but have a completely separate codebase from your Meteor project.

A collection of npm packages are being developed to make it easy for you to integrate React Native with Meteor. In order to use React Native with Meteor, you create a React Native app and use the `@meteorrn/core` package to connect your app to your Meteor server.

For most projects, since your native app will display the same data and call the same methods as your Meteor web app, creating a React Native app that connects to your Meteor server does not require any changes to your Meteor codebase.

The only time you will need to make changes to your Meteor codebase is to enable certain features that are unique to your native app. For example, if you want to add push notifications to your native app, you will need to create a method on your Meteor app to store the native push tokens for a user.

### Expo vs. Vanilla React Native

There are two routes for getting started with React Native. You can use "Vanilla" React Native, or you can use [Expo](https://expo.io/). Expo is a set of tools built around React Native. You can even try out React Native from your web browser using [Expo Snack](https://snack.expo.io/).

**Downsides to using Expo:**

- You cannot add Native Modules that use Native Code (Java, Swift, etc)
- You cannot use packages that require linking (npm modules that include native code)
- Apps that use Expo are much larger than pure React Native apps

Expo does provide some native features ([click here for the full list](https://docs.expo.io/versions/latest/)), but if there is a feature missing that you need, you'll likely need to use an npm package or your own custom native code.

You can "eject" your app from Expo to take advantage of Vanilla React Native features, but ejection cannot be undone easily.

Here is the link to the React Native getting started documentation: https://reactnative.dev/docs/environment-setup

Once you have your environment setup and have your app running on your device or in the emulator, you can proceed to the next step.

## Installation

To install the `@meteorrn/core` package, run the following command in your React Native project:

```bash
npm install --save @meteorrn/core
```

You also need to confirm you have the package's peer dependencies installed:

- Confirm you have `@react-native-community/netinfo` installed
- Confirm you have `@react-native-async-storage/async-storage@>=1.8.1` installed

The `@meteorrn/core` package enables your React Native app to establish a DDP connection with your Meteor server so it can receive data from publications and call server methods. It also provides access to core Meteor client methods like `Accounts.createUser` and `Meteor.loginWithPassword`, and allows you to display data in your app with the `withTracker` method or hooks.

## Setup

First, import `Meteor`, `withTracker`, and `Mongo`:

```js
import Meteor, { Mongo, withTracker } from '@meteorrn/core';
```

Next, you need to connect to your Meteor server. This should typically be at the start of your App.jsx:

```js
Meteor.connect('wss://myapp.meteor.com/websocket');
```

For local development, you can connect to your local Meteor server:

```js
// Use your computer's IP address (not localhost) for the mobile device to connect
Meteor.connect('ws://192.168.1.100:3000/websocket');
```

Define your collections:

```js
const Todos = new Mongo.Collection('todos');
```

And now you're ready to start coding.

## Coding with Meteor React Native

If you've used React before, coding with React Native is pretty straightforward. However, instead of components like `div` and `span`, we have `View` and `Text`. You can learn the fundamentals of React Native [here](https://reactnative.dev/docs/intro-react).

Meteor React Native's usage is designed to be as close to `meteor/react-meteor-data` and the Meteor core as possible.

### Using withTracker

```jsx
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import Meteor, { Mongo, withTracker } from '@meteorrn/core';

const Todos = new Mongo.Collection('todos');

function MyApp({ loading, myTodoTasks }) {
  if (loading) {
    return (
      <View>
        <Text>Loading your tasks...</Text>
      </View>
    );
  }

  return (
    <ScrollView>
      {!myTodoTasks.length ? (
        <Text>You don't have any tasks</Text>
      ) : (
        myTodoTasks.map(task => (
          <Text key={task._id}>{task.text}</Text>
        ))
      )}
    </ScrollView>
  );
}

export default withTracker(() => {
  const handle = Meteor.subscribe('myTodos');
  const myTodoTasks = Todos.find({ completed: false }).fetch();

  return {
    myTodoTasks,
    loading: !handle.ready()
  };
})(MyApp);
```

### Using Accounts

The package also has full support for accounts, including `Meteor.loginWithPassword`, `Meteor.user`, `Accounts.createUser`, `Meteor.loggingIn`, `Accounts.forgotPassword`, etc.

```jsx
import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import Meteor from '@meteorrn/core';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleLogin = () => {
    Meteor.loginWithPassword(email, password, (err) => {
      if (err) {
        setError(err.reason);
      }
    });
  };

  return (
    <View>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error && <Text style={{ color: 'red' }}>{error}</Text>}
      <Button title="Login" onPress={handleLogin} />
    </View>
  );
}
```

### Calling Methods

```jsx
import Meteor from '@meteorrn/core';

// Call a Meteor method
async function addTask(text) {
  try {
    const result = await Meteor.callAsync('tasks.insert', text);
    console.log('Task added:', result);
  } catch (error) {
    console.error('Error adding task:', error);
  }
}
```

### Rendering large lists

If you are rendering large amounts of data, you should use the [FlatList](https://reactnative.dev/docs/flatlist) component instead of mapping over arrays:

```jsx
import { FlatList, Text, View } from 'react-native';

function TodoList({ todos }) {
  return (
    <FlatList
      data={todos}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => (
        <View>
          <Text>{item.text}</Text>
        </View>
      )}
    />
  );
}
```

## Further reading

- [Meteor React Native API docs](https://github.com/TheRealNate/meteor-react-native/blob/master/docs/api.md)
- [React Native API docs](https://reactnative.dev/docs/components-and-apis)
- [Example components built with MeteorRN](https://github.com/TheRealNate/meteor-react-native/tree/master/examples)
