---
title: React Native
description: How to integrate your React Native apps with Meteor
---

React Native has grown to be one of the most popular platforms for building native apps. React Native allows you to write apps in JavaScript that are rendered with native code. It has many of the features that you value when working with Meteor, like instant refresh on save. 

You can easily integrate your React Native app with Meteor, using the same methods you would on a Meteor + React Web app. The integration supports most Meteor features, including Methods, Pub/Sub, and Password Accounts, and has the same usage as `react-meteor-data`.

<h2 id="getting-started">Getting started with React Native</h2>

There are two routes for getting started with React Native. You can use "Vanilla" React Native, or you can use [Expo](https://expo.io/). Expo is a set of tools built around React Native. You can even try out React Native from your web browser using [Expo Snack](https://snack.expo.io/). You don't even need to install XCode or Android Studio to start using Expo.

Here are the downsides to using Expo:
- You cannot add Native Modules that use Native Code (Java, Swift, etc)
- You cannot use packages that require linking (these are npm modules that include native code, and allow you to acess native features like the camera, push notifications, fingerprint authentication, etc). \
- Apps that use Expo are much larger then pure React Native apps

Expo does provide some native features ([click here for the full list](https://docs.expo.io/versions/latest/)), but if there is a feature missing that you need, you'll likely need to use an npm package or your own custom native code.

You can "eject" your app from Expo to take advantage of Vanilla React Native features, but ejection cannot be undone easily.

The React Native documentation lets you choose between the Expo ("Expo CLI") and Vanilla React Native ("React Native CLI") setup instructions. You can read through the installation instructions and decide which option makes more sense for you.

Here is the link to the React Native getting started documentation: https://reactnative.dev/docs/environment-setup

Once you have your environment setup and have your app running on your device or in the emulator, you can proceed to the next step of the guide: "Meteor React Native Installation"

<h2 id="installation">Meteor React Native Installation</h2>

Once you have your React Native environment setup, you can install the meteor-react-native package:

````
npm install --save meteor-react-native
````

**Note: If your React Native app uses version 0.59 or lower, the meteor-react-native package contains breaking changes. Use [react-native-meteor](https://www.npmjs.com/package/react-native-meteor) instead.**

Now to setup your app.

First, import `Meteor`, `withTracker`, and `Mongo`:

````
import { Meteor, Mongo, withTracker } from 'meteor-react-native';
````

Next, you need to connect to your Meteor server. This should typically be at the start of your App.jsx.

````
Meteor.connect("wss://myapp.meteor.com");
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
const MyAppContainer = withTracker(() = {
    
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
        let { loading, myTodoTasks } = this.props;
        
        if(loading) {
            return <View><Text>Loading your tasks...</Text></View>
        }
        
        return (
            <ScrollView>
                {myTodoTasks.length > 0 ?
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

You can view the full API docs on the [meteor-react-native repo](https://github.com/TheRealNate/meteor-react-native/blob/master/docs/api.md)
