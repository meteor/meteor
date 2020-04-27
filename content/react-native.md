---
title: React Native
description: How to integrate your React Native apps with Meteor
---

React Native has grown to be one of the most popular platforms for building native apps. You can easily integrate your React Native app with Meteor, using the same methods you would on a Meteor + React Web app. The integration supports most Meteor features, including Methods, Pub/Sub, and Password Accounts, and has the same usage as `react-meteor-data`.

<h2 id="installation">Installation</h2>

In your React Native app you need to install the meteor-react-native package.

````
npm install --save meteor-react-native
````

**Note: If your React Native app uses version 0.59 or lower, the meteor-react-native package contains breaking changes. Use [react-native-meteor](https://www.npmjs.com/package/react-native-meteor) instead.**

<h2 id="usage">Basic Usage</h2>

Import `Meteor`, `withTracker`, and `Mongo`:

````
import { Meteor, Mongo, withTracker } from 'meteor-react-native';
````

Connect to your Meteor Server:

````
Meteor.connect("wss://myapp.meteor.com");
````

Define your collections:

````
const Todos = new Mongo.Collection("todos");
````

Pass data to your component using withTracker:

````
const MyAppContainer = withTracker(() = {
    
    const myTodoTasks = Todos.find({completed:false}).fetch();
    
    return {
        myTodoTasks
    };
    
})(MyApp);
````


You can view the full API docs on the [meteor-react-native repo](https://github.com/TheRealNate/meteor-react-native/blob/master/docs/api.md)
