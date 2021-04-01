---
title: Introduction
description: This is the guide for using Meteor, a full-stack JavaScript platform for developing modern web and mobile applications.
---

<!--  XXX: note that this content is somewhat duplicated on the docs, and should be updated in parallel -->
<h2 id="what-is-meteor">What is Meteor?</h2>

Meteor is a full-stack JavaScript platform for developing modern web and mobile applications. Meteor includes a key set of technologies for building connected-client reactive applications, a build tool, and a curated set of packages from the Node.js and general JavaScript community.

- Meteor allows you to develop in **one language**, JavaScript, in all environments: application server, web browser, and mobile device.

- Meteor uses **data on the wire**, meaning the server sends data, not HTML, and the client renders it.

- Meteor **embraces the ecosystem**, bringing the best parts of the extremely active JavaScript community to you in a careful and considered way.

- Meteor provides **full stack reactivity**, allowing your UI to seamlessly reflect the true state of the world with minimal development effort.

<h2 id="quickstart">Quick start</h2>

Meteor supports [OS X, Windows, and Linux](https://www.meteor.com/developers/install).

On OS X or Linux?  Install the latest official Meteor release from your terminal:

```bash
curl https://install.meteor.com/ | sh
```

On Windows? Install the latest official Meteor release from your terminal:

```bash
npm install -g meteor
```

Once you've installed Meteor, create a project:

```bash
meteor create myapp
```

Run it locally:

```bash
cd myapp
meteor npm install
meteor
# Meteor server running on: http://localhost:3000/
```

> Meteor comes with npm bundled so that you can type `meteor npm` without worrying about installing it yourself. If you like, you can also use a globally installed npm to manage your packages.

<h2 id="learning-more">Meteor resources</h2>

1. The place to get started with Meteor is the [tutorials page](https://www.meteor.com/developers/tutorials).

2. [Stack Overflow](http://stackoverflow.com/questions/tagged/meteor) is the best place to ask (and answer!) technical questions. Be sure to add the meteor tag to your question.

3. Visit the [Meteor discussion forums](https://forums.meteor.com) to announce projects, get help, talk about the community, or discuss changes to core.

4. The [Meteor docs](https://docs.meteor.com) is the best place to find the core API documentation of the platform.

5. [Atmosphere](https://atmospherejs.com) is the repository of community packages designed especially for Meteor.

6. [Awesome Meteor](https://github.com/Urigo/awesome-meteor) is a community-curated list of [packages](https://github.com/Urigo/awesome-meteor#getting-started) and [resources](https://github.com/Urigo/awesome-meteor#resources).

<h2 id="what-is-it">What is the Meteor Guide?</h2>

This is a set of articles outlining opinions on best-practice application development using the [Meteor](https://meteor.com) platform. Our aim is to cover patterns that are common to the development of all modern web and mobile applications, so many concepts documented here are not necessarily Meteor specific and could be applied to any application built with a focus on modern, interactive user interfaces.

Nothing in the Meteor guide is *required* to build a Meteor application---you can certainly use the platform in ways that contradict the principles and patterns of the guide. However, the guide is an attempt to document best practices and community conventions, so we hope that the majority of the Meteor community will benefit from adopting the practices documented here.

The APIs of the Meteor platform are available at the [docs site](https://docs.meteor.com), and you can browse community packages on [atmosphere](https://atmospherejs.com).

<h3 id="audience">Target audience</h3>

The guide is targeted towards intermediate developers that have some familiarity with JavaScript, the Meteor platform, and web development in general. If you are just getting started with Meteor, we recommend starting with the [tutorials](https://www.meteor.com/developers/tutorials).

<h3 id="example-app">Example apps</h3>

If you want to see some examples, we have a repository dedicated with several examples provided by the community showing many concepts that can be used when implementing your application with Meteor. To know more you can [here](https://github.com/meteor/examples).

<h2 id="guide-concepts">Guide development</h2>

<h3 id="contributing">Contributing</h3>

Ongoing Meteor Guide development takes place **in the open** [on GitHub](https://github.com/meteor/guide). We encourage pull requests and issues to discuss problems with any changes that could be made to the content. We hope that keeping our process open and honest will make it clear what we plan to include in the guide and what changes will be coming in future Meteor versions.

<h3 id="goals">Goals of the project</h3>

The decisions made and practices outlined in the guide must necessarily be **opinionated**. Certain best practices will be highlighted and other valid approaches ignored. We aim to reach community consensus around major decisions but there will always be other ways to solve problems when developing your application. We believe it's important to know what the "standard" way to solve a problem is before branching out to other options. If an alternate approach proves itself superior, then it should make its way into a future version of the guide.

An important function of the guide is to **shape future development** in the Meteor platform. By documenting best practices, the guide shines a spotlight on areas of the platform that could be better, easier, or more performant, and thus will be used to focus a lot of future platform choices.

Similarly, gaps in the platform highlighted by the guide can often be plugged by **community packages**; we hope that if you see an opportunity to improve the Meteor workflow by writing a package, that you take it! If you're not sure how best to design or architect your package, reach out on the forums and start a discussion.
