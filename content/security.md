---
title: "Security"
---

After reading this guide, you'll know:

1. The security surface area of a Meteor app
2. How to secure methods, publications, and source code
3. Where to store secret keys in development and production
4. How to follow a security checklist when auditing your app

## Security

Securing a web application is all about understanding security domains and understanding the attack surface between these domains. In a Meteor app, things are pretty simple:

1. Code that runs on the server can be trusted
2. Everything else: code that runs on the client, data sent through method and publication arguments, etc, can't be trusted

In practice, this means that you should do most of your security and validation on the boundary between these two domains. In simple terms:

1. Validate and check all data that comes from the client
2. Don't leak any secret data to the client

### The surface area of a Meteor app

Since Meteor apps are often written in a style that puts client and server code together, it's extra important to be aware what is running on the client, what is running on the server, and what the boundaries are. Here's a complete list of places security checks need to be done in a Meteor app:

1. **Methods**: Any data that comes in through method arguments needs to be validated, and methods should not return data the user shouldn't have access to.
2. **Publications**: Any data that comes in through publication arguments needs to be validated, and publications should not return data the user shouldn't have access to.
3. **Served files**: You should make sure none of the source code or configuration files served to the client have secret data.

Each of these points will have their own section below.

#### Don't use Collection.allow/deny

In this guide, we're going to take a strong position that using [allow](http://docs.meteor.com/#/full/allow) or [deny](http://docs.meteor.com/#/full/deny) to run MongoDB queries directly from the client is not a good idea. The main reason is that it is very hard to follow the principles outlined above. It's extremely hard to validate the complete space of possible MongoDB operators, which could potentially grow over time.

There have been several articles about the potential pitfalls of accepting MongoDB update operators from the client, in particular the [Allow & Deny Security Challenge](https://www.discovermeteor.com/blog/allow-deny-security-challenge/) and its [results](https://www.discovermeteor.com/blog/allow-deny-challenge-results/), both on the Discover Meteor blog.

Given the points above, we're going to recommend that all Meteor apps should use Methods to accept data input from the client, and restrict the arguments accepted by each Method as tightly as possible.
