---
title: Welcome
---

Welcome to the Meteor guide.

This is a set of articles outlining opinions on best-practice application development in the [Meteor](https://meteor.com) framework. Our aim is that the set of articles detailed here covers patterns that are common to the development of all modern web and mobile applications. In this sense a lot of what's documented here is not necessarily Meteor specific and could be equally be applied to any application built with a focus on modern, reactive user interfaces.

Nothing in the Meteor guide is *required* to build a Meteor application (i.e. you can certainly use the platform in ways that contradict the principles and patterns of the guide). However, the guide is an attempt to document what we consider are best practices for app development. The guide is also an effort to document community conventions, and so we expect that in the future the practices documented here will generally be followed by the majority of the Meteor community.

To learn about "pure" Meteor, you can The APIs of the Meteor platform are available a the [docs site](https://docs.meteor.com), and you can browse community packages on [atmosphere](https://atmospherejs.com).

The guide is intended as an intermediate document, aimed at those with some familiarity with the Meteor platform and web development in general. If you are just getting started with Meteor, we recommend beginning with the official [tutorial](https://www.meteor.com/tutorials/blaze/creating-an-app).

<h2 id="example-app">Example App</h2>
Most guides make reference to the Todos example application. You can create your own copy of the example application with

```bash
meteor create --example todos
```

Additionally, you see the latest source code for the app, and file issues or make suggestions via pull request at its [GitHub repository](https://github.com/meteor/todos).

<h2 id="what-is-meteor">What is Meteor?</h2>

Meteor is a full-stack JavaScript framework for developing modern web and mobile applications. Meteor consists of a key set of technologies for building connected-client reactive user interfaces, and a build tool and curated set of packages from the wider Node and general JavaScript community.

 - Meteor allows you to develop in *one language* in all environments, be it server, web browser or mobile device.

 - Meteor prefers *data on the wire*, letting the server send data, not HTML, and the client render it.

 - Meteor *embraces the ecosystem*, bringing the best parts of the extremely active JavaScript community to you in careful and consistent way.

 - 

3. Meteor principles
  1. Data on the Wire. Meteor doesn't send HTML over the network. The server sends data and lets the client render it.
  1. One Language. Meteor lets you write both the client and the server parts of your application in JavaScript.
  1. Database Everywhere. Query data on the client using the same syntax you use on the server.
  1. Optimistic UI. On the client, Meteor prefetches data and simulates models to make it look like server method calls return instantly.
  1. Full Stack Reactivity. In Meteor, realtime is the default. All layers, from database to template, update themselves automatically when necessary.
  1. Embrace the Ecosystem. Meteor is open source and integrates with existing open source tools and frameworks, with a strong ecosystem of community packages.
  1. Simplicity Equals Productivity. The best way to make something seem simple is to have it actually be simple. Meteor's main functionality has clean, classically beautiful APIs.


<h2 id="guide-concepts">Guide concepts</h2>
The Meteor Guide is developed in the open at the [GitHub repository](https://github.com/meteor/guide) and we encourage pull requests and issues to discuss problems with and changes that could be made to the content. By keeping our process open and honest we hope it's clear what will and will not be in the guide and what changes will be coming to the guide in the next Meteor version.

The decisions made and practices outlined in the guide must necessarily be opinionated; to some degree certain best practices must be highlighted and other valid approaches ignored. In making such decisions we aim to reach community consensus in our choices but there'll always be other ways to solve problems and it's certainly possible to make other choices in developing your application. It's important of course to know what the "official" way to solve a problem is before making another choice. If an alternate approach proves itself superior, there's no reason it could not make its way into a future version of the guide of course.

An important function of the guide is to shape future development in the Meteor platform. By documenting best practice in how to develop Meteor applications, the guide provides a clear demonstration of places in the framework that could be better, easier or more performant, and thus will be used to focus a lot of future platform choices.

Similarly, gaps in the framework highlighted by the guide can often be plugged by community packages; we hope that if you see an opportunity to improve thing by writing a package, that you take the opportunity!

<h2 id="learning-more">Learning more about Meteor</h2>

1. The place to get started with Meteor is the [official tutorial](https://www.meteor.com/tutorials/blaze/creating-an-app).

2. [Stack Overflow](http://stackoverflow.com/questions/tagged/meteor) is the best place to ask (and answer!) technical questions. Be sure to add the meteor tag to your question.

3. Visit the [Meteor discussion forums](https://forums.meteor.com) to announce projects, get help, talk about the community, or discuss changes to core.

4. The [Meteor docs](https://docs.meteor.com) is the best place to find the core API documentation of the platform.
 
5. [Atmopshere](https://atmospherejs.com) is the repository of community packages designed especially for Meteor.