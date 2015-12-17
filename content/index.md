---
title: Welcome!
order: 0
---

This is a work in progress deployment of the Meteor Guide. We're tracking our progress writing articles using [Waffle.io](https://waffle.io/meteor/guide?label=article).

- See the example app we're working on to embody the principles from the guide at [meteor/todos](https://github.com/meteor/todos). Keep in mind that it's still a work in progress so some things are rough around the edges.
- Check out the [outlines and discussions](https://github.com/meteor/guide/labels/article)

### How to contribute

If you're interested in helping out, the best thing to do is to look at the [GitHub issues which represent the 16 guide articles](https://github.com/meteor/guide/labels/article). If any topics interest you, read the outlines and major decision points linked from the issue, and post comments or PRs offering suggestions!

---

Welcome to the Meteor guide.

This is a set of articles outlining opinions on best-practice application development in the [Meteor](https://meteor.com) platform. Our aim is that the set of articles detailed here covers patterns that are common to the development of all modern web and mobile applications. In this sense a lot of what's documented here is not necessarily Meteor specific and could be equally be applied to any application built with a focus on modern, interactive user interfaces.

Nothing in the Meteor guide is *required* to build a Meteor application---you can certainly use the platform in ways that contradict the principles and patterns of the guide. However, the guide is an attempt to document best practices and community conventions, so we hope that the majority of the Meteor community will benefit from adopting the practices documented here.

The APIs of the Meteor platform are available a the [docs site](https://docs.meteor.com), and you can browse community packages on [atmosphere](https://atmospherejs.com).

The guide is targeted towards intermediate developers, aimed at those with some familiarity with the Meteor platform and web development in general. If you are just getting started with Meteor, we recommend beginning with the official [tutorial](https://www.meteor.com/tutorials/blaze/creating-an-app).

<h2 id="example-app">Example App</h2>
Most guides make reference to the Todos example application. This code is actively being developed alongside the guide. You can see the latest source code for the app, and file issues or make suggestions via pull request at its [GitHub repository](https://github.com/meteor/todos).

<h2 id="what-is-meteor">What is Meteor?</h2>

Meteor is a full-stack JavaScript platform for developing modern web and mobile applications. Meteor consists of a key set of technologies for building connected-client reactive user interfaces, and a build tool and curated set of packages from the wider Node and general JavaScript community.

 - Meteor allows you to develop in *one language*, JavaScript, in all environments, be it server, web browser or mobile device.

 - Meteor prefers *data on the wire*, letting the server send data, not HTML, and the client render it.

 - Meteor *embraces the ecosystem*, bringing the best parts of the extremely active JavaScript community to you in careful and considered way.

 - Meteor provides *full stack reactivity*, allowing you to write frontends that seamlessly reflect the true state of the world with minimal effort on your behalf.

<h2 id="guide-concepts">Guide concepts</h2>
The Meteor Guide is developed in the open at the [GitHub repository](https://github.com/meteor/guide) and we encourage pull requests and issues to discuss problems with and changes that could be made to the content. By keeping our process open and honest we hope it's clear what will and will not be in the guide and what changes will be coming to the guide in the next Meteor version.

The decisions made and practices outlined in the guide must necessarily be opinionated; to some degree certain best practices must be highlighted and other valid approaches ignored. In making such decisions we aim to reach community consensus in our choices but there'll always be other ways to solve problems and it's certainly possible to make other choices in developing your application. It's important of course to know what the "official" way to solve a problem is before making another choice. If an alternate approach proves itself superior, there's no reason it could not make its way into a future version of the guide of course.

An important function of the guide is to shape future development in the Meteor platform. By documenting best practice in how to develop Meteor applications, the guide provides a clear demonstration of places in the platform that could be better, easier or more performant, and thus will be used to focus a lot of future platform choices.

Similarly, gaps in the platform highlighted by the guide can often be plugged by community packages; we hope that if you see an opportunity to improve thing by writing a package, that you take the opportunity!

<h2 id="learning-more">Learning more about Meteor</h2>

1. The place to get started with Meteor is the [official tutorial](https://www.meteor.com/tutorials/blaze/creating-an-app).

2. [Stack Overflow](http://stackoverflow.com/questions/tagged/meteor) is the best place to ask (and answer!) technical questions. Be sure to add the meteor tag to your question.

3. Visit the [Meteor discussion forums](https://forums.meteor.com) to announce projects, get help, talk about the community, or discuss changes to core.

4. The [Meteor docs](https://docs.meteor.com) is the best place to find the core API documentation of the platform.
 
5. [Atmopshere](https://atmospherejs.com) is the repository of community packages designed especially for Meteor.