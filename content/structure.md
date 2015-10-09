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

## The building blocks of a Meteor app

All Meteor apps will have some or all of the following components. Later when discussing application structure, we'll mostly be talking about where all of these components should go. Not every piece of code in your app will fall under one of the categories below, but these will make up the bulk of your code.

| Client only | Server only | Both |
| --- | --- | --- |
| Templates,<br />Stylesheets,<br />Routes | Publications | Collections,<br />Methods |
