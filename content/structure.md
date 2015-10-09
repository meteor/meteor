# Application structure

Since everything is JavaScript and code can be shared between all parts of your app, Meteor presents new opportunities for code organization. But with great power comes great responsibility.

This article won't attempt to document all of the different ways to lay out your app code, or every bit of functionality offered by Meteor's directory structure and package format. It will give you some recommended patterns that can get you started on the path to a nicely organized app, but at the end of the day you choose how your app's code is laid out.

Read the docs about all of the [special file and folder names](http://docs.meteor.com/#/full/structuringyourapp). Once you're familiar with some of the tools at your disposal, let's see how to use them to structure your app.

### Code can be on the client, server, or both

In a traditional web application, there is a hard line between client and server code. In some frameworks, they are even written in different languages - for example, in a Rails app, server code is in Ruby and client code is in JavaScript.

In Meteor, all of your application logic will be written in JavaScript (or a language that compiles to JS, like CoffeeScript). Once all of your code is in one language, it becomes possible to share code between the client and server. Meteor is built to make this code sharing natural, and a lot of components in a Meteor app expect to live on both sides of the wire.

This also gives us freedom to structure our app code in terms of the features we are building, and not the layers of the technology stack. We can keep the server logic for a certain feature right next to our UI templates, so that a developer doesn't have to understand the entire code base just to add something to an app.

### Different sizes of application have different needs

In this guide, we'll talk about three different types of applications, in order. These correspond to different stages of your app development process, and need different tradeoffs between rapid development and modularity.

1. **Small app**: All code is in one directory tree, no need for explicit modularity. Developed by a small team as a prototype.
2. **Medium app**: Most code is moved into packages to ensure strict APIs between parts of the code. A real production app.
3. **Large app**: This app is composed of several Meteor projects that are deployed separately and share code through packages. The pieces talk to each other by sharing data through the database, or by explicit DDP and REST APIs. The ultimate in code separation - this is appropriate if you have one team developing an administration backend, another team developing your mobile app, and a third for your landing page/marketing website.

### The building blocks of a Meteor app

All Meteor apps will have some or all of the following components. Later when discussing application structure, we'll mostly be talking about where all of these components should go. Not every piece of code in your app will fall under one of the categories below, but these will make up the bulk of your code.

| Client only | Server only | Both |
| --- | --- | --- |
| Templates,<br />Stylesheets,<br />Routes | Publications | Collections,<br />Methods |

## Structure of a small app

This type of application structure is suitable for a small project, or the beginning of a big one. It emphasizes rapid development and ease of refactoring over modularity and code reusability.

Since you don't need to declare any dependencies between files, and there are no hard-coded paths anywhere, you can split up and move files basically whenever you want. When you're trying to nail down an initial prototype and aren't ready to commit to a rigid structure yet, this can be quite valuable.

XXX refactor todos example app to be the best example for this!

## Structure of a medium-sized app

Once your app gets to a certain size, developing it using the file structure above can get pretty cumbersome. In particular, here are some issues you might run into:

1. **App-scoped variables**: If a certain function or object is exported from a file, it becomes global to the whole app. This means that refactoring it can require tons of find-and-replace style operations, and you can never be quite sure you caught everything.
2. **File load order**: Since you can't define explicit dependencies between parts of your code, you need to rely on Meteor's automatic file ordering to make sure things are defined in the right order. In a large app, it can be hard to wrangle this system to do what you want.
3. **Lack of individually testable modules**: Since your code is in one large blob, it can be hard to separate parts of it out for testing. You're basically limited to behavioral and integration tests.

To solve the three problems above, we need to move to a new application structure where our code is more clearly separated into modules. The way to do this in Meteor is to split your app into *local packages*.

XXX directions for building a package are probably in a different guide!

### Types of packages

You'll end up with two kinds of packages in your app:

1. Packages that contain reusable bits of code or UI that are used across different features
2. Packages that implement a specific feature, and the code is not reused elsewhere

There isn't any concrete difference between the two, but it's good to keep in mind which are which. The feature packages will look a lot like small chunks of an app, so you can basically write them as you would any other app code. The packages with reusable code should probably follow a few extra guidelines.

### Guidelines for reusable packages in an app

Here are some tips to keep in mind when you are building local packages that you expect to be used in lots of different parts of your app.

1. **Avoid side effects.** These packages can define UI components, JavaScript functions, or LESS mixins, but they shouldn't add anything to the global properties of the app - this means no methods, collections, or publications. Any UI components included should be optimized for reusability. XXX link to reusable components guide here!
2. **Expose a documented, testable API.** Treat the package like something you would publish. Since you have other developers working with you on this app, you might need to document how to use it and what other developers should expect to get when they include this package in their part of the app. This API should be tested so that when you optimize or update your package it's unlikely to break some other part of the app.

## Structure of a large, multi-app project

The pattern for a medium-sized app can get you pretty far! However, you might end up in a situation where it's not sufficient. Here are some reasons you might want to split your project into multiple Meteor apps.

1. **Totally separate user interfaces.** You might find that your project has two completely different kinds of users. For example, maybe you're building an Uber-like project and you want one app for the administrators, one for the support team, one for the drivers, and one for people requesting rides. They all deal with the same data, they might share UI components, and they have some common code, but a large part of the functionality is totally separate. You probably don't want to ship the entire administration UI as part of your end-user mobile app.
2. XXX what else?

XXX basically this: http://meteorpatterns.com/Sewdn/project-builds
