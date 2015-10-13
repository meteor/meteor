# Meteor guide outlines

This is an attempt to write a comprehensive outline of all of the guides one would need to read to build a professional-quality application with Meteor. Each guide has a title, a tagline that explains why this concept is important in Meteor, and 5-10 sections which are named in the format: “After reading this guide, you'll know...”

### Meteor guide: Application structure

Since everything is JavaScript and code can be shared between all parts of your app, Meteor presents new opportunities for code organization. But with great power comes great responsibility.

1. What are the different parts of a Meteor app
2. How to build your app around features instead of stack layers
3. How to split your code into the right number of files and how to organize those files in directories, in a way that will scale as your project grows
4. Best practices for making your app modular so that you can work on one part of the codebase without fear that some other part will break unexpectedly
5. How to split your app into smaller apps that each have a smaller surface area while sharing code and data
6. The Meteor style guide

[See the document.](content/structure.md)

Status: Initial draft 50% done.

### Meteor guide: Collections and models

We'll explain how to deal with collections across client and server. Then we'll reduce code repetition by extending database documents with model classes.

1. How to define and use MongoDB collections in Meteor
2. The distinctions between collections on the client and collections on the server
3. How to define a model with schemas and validations for a collection
4. How to add setters and getters to your model to centralize your database logic
5. How to design a schema that works well with Meteor's data system and can be extended over time
6. How to migrate data when you want to change the structure or schema of your collections
7. How to model relational data, even when your database is not relational

### Meteor guide: Data loading and management

Meteor lets you write your UI as if the database is present on the client while maintaining security and the ability to have a decoupled data model. Sound like a contradiction? We'll explain how to use all of the tools together to get the best balance of fast development and maintainability.

1. How to load and use data from the database over DDP
2. How to load just enough data to display your UI while using caching to make sure the UI is as fast as possible
3. When to use local component state and when to have a global store
4. How to build your own client-side reactive data stores with ReactiveVar, ReactiveDict, and Tracker
5. Modifying data stores using Methods
6. How to use data from external APIs on the client and server
    1. HTTP
    2. DDP
    3. Webhooks
7. How to publish and use relational data
8. How to do pagination or infinite scroll so that you can load data incrementally as the user needs it

### Meteor guide: UI/UX

Meteor supports many different UI frameworks in addition to having its own default framework, Blaze. While all of these frameworks have their own documentation, there's a lot to learn about building a UI for a large app that is UI-framework-agnostic.

1. When to build reusable components and when not to
2. Optimizing event handling for realtime input by throttling effectively
3. Good patterns for revealing new data without startling the user
4. Using animations effectively for a great user experience
5. Designing a responsive application that works across different devices
6. Make your app appeal to a wider user base with internationalization
7. How to make your app more accessible to people with disabilities

### Meteor guide: Accounts

Meteor's login system works pretty well out of the box, but there are a few tips and tricks to set things up just the way you want them.

1. Picking an accounts UI package
2. Setting up password reset, email verification, and enrollment emails
3. Setting up OAuth login services
4. Building your own login service
4. Adding custom fields to the users collection and using them

### Meteor guide: Security

Meteor apps can be very easy to secure if you follow a few simple principles, and there are some packages that streamline the process for you.

1. The security surface area of a Meteor app
    1. Methods
    2. Publications
    3. Served files
2. How to set up roles and permissions for user accounts
3. How and why to use SSL
4. How to manage sensitive API keys and configuration
5. Common mistakes and misconceptions

### Meteor guide: Forms, user input, and methods

How to build your C~~R~~UD with a stellar user experience, with no extra effort.

1. How to define a method with optimistic UI and validation
2. How to wire up a button or single UI control to a method
3. How to wire up a form to a method
4. Error handling
5. Realtime validation
6. Optimistic UI and when to use it
7. Saving intermediate inputs in case the user closes the tab accidentally
8. How to use a method to write data to external APIs
9. How to enable users to upload files

### Meteor guide: Routing

What do URLs mean in a mobile and client-rendering world, and how does one use them properly?

1. What role URLs play in a client-rendered app, and how it's different from a traditional server-rendered app
2. How to define client and server routes for your app using Flow Router
3. How to have your app display different content depending on the URL
4. How to construct links to routes and go to routes programmatically
5. How to handle URLs in your app that should only be accessible to certain users
6. How and why to use a UI framework native router, like Angular router or React Router

[See the document.](content/routing.md)

Status: Initial draft 80% done.

### Meteor guide: Testing

Write some extra code now to make sure you don't break your code when you add more code later. Add features and refactor your app with no fear.

1. How to test:
    1. Methods
    2. Publications
    3. Models
    4. Routes
    5. UI components
2. How to structure your code with modules so that it can be tested more easily
3. How to stub parts of the Meteor framework so that you can test a small part of your app at a time
4. How to mock data in a realistic way
5. How to set up continuous integration so that you can't forget to run the tests

### Meteor guide: Mobile

Build a really good mobile experience with just a little bit of extra effort.

1. How to set up your development environment for Android and iOS
2. How to enable mobile debugging, logging, testing
3. How to optimize your user experience on mobile to make your app feel smooth and usable
4. How to use native mobile features through Cordova plugins
5. How to add push notifications, intents, and other mobile operating system integrations
6. How to use hot code push effectively to update your app outside of the normal app store review process while maintaining a great user experience

### Meteor guide: The build tool

Meteor brings sane, zero-configuration defaults to the previously tedious tasks of compiling, concatenating, minifying, and transforming assets.

1. How to use popular transpiled languages in Meteor out of the box:
    1. ES2015+
    2. LESS
    3. SASS
    4. Coffee
    5. TypeScript
2. How to use packages from other packaging systems:
    1. Compatibility directory and 'bare' files
    2. Bower
    3. NPM

### Blaze guide: The Tracker-based reactive templating system

Write “HTML with holes” just like you're used to, and get a fast, fine-grained, reactively updating page with no sweat.

1. Spacebars syntax, and how to use the built-in helpers
2. Building reusable components with Blaze by avoiding global data
3. How to use reactivity in a principled way
4. Writing maintainable helpers and event handlers that aren't tightly coupled to HTML
5. Reusing logic and HTML snippets between templates



## Advanced

### Meteor production guide: Deployment, monitoring, and analytics

Now that you've built a sweet app, give it to the world. It can be hard to run a production app, that's where Galaxy comes in.

1. Integrating with popular analytics platforms to track method calls, publications, and URL hits
2. Profiling your app locally
3. Monitoring your app in production (with Kadira)
3. Escape hatches for performance issues
4. Staging and testing
5. Rolling updates with hot code push
6. Debugging production apps (with Kadira Debug)
6. Galaxy

### Meteor guide: Building a great package

The Meteor package ecosystem is a unique place where many of the packages are designed to work together around a standard, well-defined stack. Learn how you can easily and effectively contribute!

1. Creating a simple package and publishing it
2. How to deliver different code for different platforms and architectures
3. How to integrate an existing Cordova plugin or write your own
4. How to use monkey-patching to add new features to existing APIs
5. Biting off what you can chew - what's the perfect size for a package?
6. How to test your package and set up CI
7. How to document your package
8. How to publicize your package and become famous in the Meteor community
9. How to deal with pull requests and issues
10. How to pick a license for your package
11. How make a build plugin
    1. Compiling single files into other single files
    2. Compiling many files at once that can be inter-related
