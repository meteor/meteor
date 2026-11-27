---
title: React Native
description: How to integrate your React Native apps with Meteor
---

React Native has grown to be one of the most popular platforms for building native apps, being used by [companies like Tesla, Instagram, and Facebook](https://reactnative.dev/showcase) in production. React Native allows you to write apps in JavaScript that are rendered with native code. It has many of the features that you value when working with Meteor, like instant refresh on save. 

You can easily integrate your React Native app with Meteor, using the same methods you would on a Meteor + React Web app. The integration supports most Meteor features, including Methods, Pub/Sub, and Password Accounts, and has the same usage as `react-meteor-data`.

<h2 id="getting-started">Getting started with React Native</h2>

React Native projects are coded using the same React principles, but have a completely separate codebase from your Meteor project.

A collection of NPM packages are being developed to make it easy for you to integrate React Native with Meteor. In order to use React Native with Meteor, you create a React Native app and use the `@meteorrn/core` package to connect your app to your Meteor server. The `@meteorrn/core` package contains Meteor, MongoDB, `withTracker`, Accounts, and more.

For most projects, since your native app will display the same data and call the same methods as your Meteor web app, creating a React Native app that connects to your Meteor server does not require any changes to your Meteor codebase.

The only time you will need to make changes to your Meteor codebase is to enable certain features that are unique to your native app. For example, if you want to add push notifications to your native app, you will need to create a method on your Meteor app to store the native push tokens for a user.

There are two ways to get started with React Native: using React Native CLI and Expo. 

<h3 id="workflow-native">Use React Native CLI</h3>

The React Native guide to get started describes this workflow as following:

> If you are already familiar with mobile development, you may want to use React Native CLI. It requires Xcode or Android Studio to get started. If you already have one of these tools installed, you should be able to get up and running within a few minutes. If they are not installed, you should expect to spend about an hour installing and configuring them.

Here is the link to the React Native getting started documentation: https://reactnative.dev/docs/environment-setup?guide=native

<h3 id="workflow-expo">Use Expo</h3>

The React Native guide to get started describes this workflow as following:

> If you are new to mobile development, the easiest way to get started is with Expo Go.

Expo is an [open-source framework](https://github.com/expo/expo) for apps that run natively on Android, iOS, and the web. The `expo` npm package enables a suite of incredible features for React Native apps. The `expo` package can be installed in nearly any React Native project. See [what Expo offers](https://docs.expo.dev/core-concepts/) for more information or see [why does Expo have its own SDK](https://docs.expo.dev/faq/#why-does-expo-have-its-own-sdk).

If you intend to create a new project using Expo, we suggest to read the [Expo getting started guide](https://docs.expo.dev/get-started/create-a-project/). Beyond that, there are some good resources to get started with Expo:

- [Development builds](https://docs.expo.dev/workflow/overview/)
- [Continuous Native Generation](https://docs.expo.dev/workflow/overview/#continuous-native-generation-cng)
- Native modules that use Native Code (either in form of third party libraries from React Native ecosystem or using Kotlin and Swift) is now possible to add. One can simply install most libraries `npm i ...` or if they want to create a native module, they can use [Expo Modules API](https://docs.expo.dev/workflow/customizing/#create-reusable-native-modules).
- [Making manual changes is also possible using Prebuild](https://docs.expo.dev/workflow/customizing/#manual-changes-to-the-native-project-files)
- [Core development loop](https://docs.expo.dev/workflow/overview/#the-core-development-loop).

Once you have your environment setup and have your app running on your device or in the emulator (Android) or simulator (iOS/MacOS), you can proceed to the next step of the guide: "Meteor React Native Installation"

<h2 id="installation">Meteor React Native Installation</h2>

To install the `@meteorrn/core` package, run the following command in your React Native project:

````
npm install --save @meteorrn/core
````

You also need to confirm you have the package's peer dependencies installed:
- Confirm you have `@react-native-community/netinfo` installed (optional, beginning with `@meteorrn/core@2.8.0)
- Confirm you have `@react-native-async-storage/async-storage@>=1.8.1` installed. If you are using Expo, or otherwise cannot use `@react-native-async-storage/async-storage`, please see [these instructions](https://github.com/TheRealNate/meteor-react-native#custom-storage-adapter).

The `@meteorrn/core` package enables your React Native app to establish a DDP connection with your Meteor server so it can receive data from publications and call server methods. It also provides access to core Meteor client methods like `Accounts.createUser` and `Meteor.loginWithPasword`, and allows you to display data in your app with the `withTracker` method.

**Note: If your React Native app uses version 0.59 or lower, the @meteorrn/core package contains breaking changes. Use [react-native-meteor](https://www.npmjs.com/package/react-native-meteor) instead.**

<h2 id="setup">Setup</h2>


First, import `Meteor`, `withTracker`, and `Mongo`:

````
import Meteor, { Mongo, withTracker } from '@meteorrn/core';
````

Next, you need to connect to your Meteor server. This should typically be at the start of your App.jsx.

````
Meteor.connect("wss://myapp.meteor.com/websocket");
````

Define your collections:

````
const Todos = new Mongo.Collection("todos");
````

And now you're ready to start coding.

<h2 id="usage">Coding with Meteor React Native</h2>

If you've used React before, coding with React Native is pretty straightforward. However, instead of components like `div` and `span`, we have `View` and `Text`. You can learn the fundamentals of React Native [here](https://reactnative.dev/docs/intro-react).

Meteor React Native's usage is designed to be as close to `meteor/react-meteor-data` and the Meteor core as possible. It provides a `withTracker` method. The package also has full support for accounts, including `Meteor.loginWithPassword`, `Meteor.user`, `Accounts.createUser`, `Meteor.loggingIn`, `Accounts.forgotPassword`, etc.

````
const MyAppContainer = withTracker(() => {
    
    const myTodoTasks = Todos.find({completed:false}).fetch();
    const handle = Meteor.subscribe("myTodos");
    
    return {
        myTodoTasks,
        loading:!handle.ready()
    };
    
})(MyApp);
````

When rendering small amounts of data, you can use the array map method:

````
import { View, ScrollView, Text } from 'react-native';

class MyApp extends React.Component {
    render() {
        const { loading, myTodoTasks } = this.props;
        
        if(loading) {
            return <View><Text>Loading your tasks...</Text></View>
        }
        
        return (
            <ScrollView>
                {!myTodoTasks.length ?
                    <Text>You don't have any tasks</Text>
                :
                    myTodoTasks.map(task => (
                        <Text>{task.text}</Text>
                    ))
                }
            </ScrollView>
        );
    }
}

````

If you are rendering a large amounts of data, you should use the [FlatList](https://reactnative.dev/docs/flatlist) component.

<h2 id="conclusion">Conclusion</h2>

**Here are some useful links for futher reading:**

You can see a list of example components built with `MeteorRN` [here](https://github.com/TheRealNate/meteor-react-native/tree/master/examples).

You can view the full API docs for `MeteorRN` on the [meteor-react-native repo](https://github.com/TheRealNate/meteor-react-native/blob/master/docs/api.md)

You can see the official React Native API docs [here](https://reactnative.dev/docs/components-and-apis)

["How to setup your first app" from HackerNoon](https://hackernoon.com/react-native-how-to-setup-your-first-app-a36c450a8a2f)

["The Full React Native Layout Cheat Sheet" from WixEngineering](https://medium.com/wix-engineering/the-full-react-native-layout-cheat-sheet-a4147802405c)
