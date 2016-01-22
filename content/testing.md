---
title: "Testing"
---

## Testing your Meteor application

## Challenges of testing a Meteor application

## Generating test data

## Unit testing in Meteor

Unit testing is the process of isolating a module of code, and then testing the internals of that module work as you expect.

As we've organized our application into modules based on features, collections and utilities, it is natural to use that same breakdown to test those modules.

### Unit testing via Mocha

We'll use the popular [Mocha](https://mochajs.org) test runner alongside the [Chai](http://chaijs.com) assertion library to test our application. In order to write tests in Mocha, we can add the [`practicalmeteor:mocha`](https://atmospherejs.com/practicalmeteor/mocha) package to our app.

```bash
meteor add practicalmeteor:mocha
```

This package provides a way for test files to register tests, and for a [test driver](#test-driver) to run them.

### Defining a Mocha test

In the Todos example app, we have a special `TodosCollection`, which set a `createdAt` field whenever we insert a new todo item. 

```js
class TodosCollection extends Mongo.Collection {
  insert(doc, callback) {
    doc.createdAt = doc.createdAt || new Date();
    return super(doc, callback);
  }
}

export default Todos = new TodosCollection('Todos');
```
[`imports/todos/Todos.js`]

We should test that the `Todos` collection indeed behaves as we expect and sets that field when we insert a doc. To do that, we can write a file `imports/todos/todos.tests.js`, and define a mocha test:

```js
import {mocha, chai} from "practicalmeteor:mocha";
import Todos from './Todos.js'
import Factory from "mdg:factory";

const {describe, it} = mocha;
const {assert} = chai;

describe('todos', () => {
  describe('mutators', () => {
    it('builds correctly from factory', () => {
      const todoId = Todos.insert(Factory.build('todo'));
      const todo = Todos.findOne(todoId);
      assert.typeOf(todo, 'object');
      assert.typeOf(todo.createdAt, 'date');
    });
  });
});
```
[`imports/todos/Todos.tests.js`]


There are a few things to note here. Firstly, we've imported from the Mocha and Factory packages, which are special packages that we can only use in test mode. Of course this test file will only be executed in test mode also!

Secondly, we've used [Mocha's API](https://mochajs.org) as well as [Chai's assertions](http://chaijs.com/api/assert/) to define a test suite, and define a test that checks that `createdAt` gets set on a todo that the factory creates.

### Adding a test driver

A test driver is a mini-application that runs in place of your app and runs each of your defined tests (each of which `import` relevant sections of your app), whilst reporting the results in some kind of user interface.

There are two main kinds of test driver packages; web-reporters which are Meteor applications and display a special test reporting web UI that you can view the test results in; and console-reporters that run completely on the command-line and are primary used for automated testing like [continuous integration](#ci) [XXX: we should probably explain more about how phantom is involved in command-line testing?]

While developing your app, chances are you'll want to run unit tests against a web reporter; for our example we will use a reporter that renders to Mocha's default web UI. We can add the driver simply by adding the [`practicalmeteor:mocha-web-reporter`](https://atmospherejs.com/practicalmeteor/mocha-web-reporter) package to our app.

```bash
meteor add practicalmeteor:mocha-web-reporter
```

This package also doesn't do anything in development or production mode, but when our app is run in [unit](#unit-test-mode) or [integration](#integration-test-mode) test mode, it takes over, running test code on both the client and server and rendering results tothe browser.

### Unit test mode

To run the unit tests that our app defines, we can run a special instance of our app in unit test mode. To do so, we run:

```
meteor test --unit
```

What this does is run a special version of our application that:

 1. Doesn't eagerly load *any* of our application code as Meteor normally would.
 2. Does eagerly load any file in our application (including in `imports/` folders) that look like `*.tests.*`. 
 3. Sets the `Meteor.isTest` and `Meteor.isUnitTest` flags to be true.
 4. Starts up the test reporter package that we've added to our app (`practicalmeteor:mocha-web-reporter`).

As we've defined a test file (`imports/todos/Todos.tests.js`), what this means is that the file above will be eagerly loaded, adding the `'builds correctly from factory'` test to the Mocha registry. 

To run the tests, you visit http://localhost:3000 in your browser, which kicks off `mocha-web-reporter`, who runs tests both in the browser, and on the server. It also renders the test results in the browser in a Mocha test reporter:

[IMAGE]

Usually, while developing an application, it make sense to run `meteor test` on a second port (say `3100`), while also running your main application

```bash
# in one terminal window
meteor

# in another
meteor test --port 3100
```

Then you can open two browser windows to see the app in action as well as ensuring you don't break any tests as you develop it.

## Integration testing

XXX: This is still a very rough sketch at this point. I want to get more of a feel for what these tests look like and what should happen.

Integration testing means invoking and asserting properties of your application while different modules work in concert. Meteor's integration testing mode runs your application as usual but replaces the user interface with a test reporter that can runs test cases both on the client and server.

### Integration test mode

To run the integration tests in our application, we run

```
meteor test --integration
```

What this does is
 
 1. Eagerly load our application code as Meteor normally would.
 2. *Also* eagerly load any file in our application (including in `imports/` folders) that look like `*.tests.*`. 
 3. Sets the `Meteor.isTest` and `Meteor.isIntegrationTest` flags to be true.
 4. Starts up the test reporter package that we've added to our app (`practicalmeteor:mocha-web-reporter`).

The key difference is in point 1 --- our app code loads as normal. So our server runs completely as usual with the full DDP API available, for example. 

On the client side, when we connect to the test instance in a browser, we want to render a testing UI rather than our apps UI, so the `mocha-web-reporter` package will remove any UI of our application and replace it with it's own. Also packages (such as `flow-router`) that might take actions based on browser connectivity should be careful to not do so when `Meteor.isTest` is set.

### Writing an integration test

To write an integration test in Mocha, we do something similar to our unit test but wrap it in a `describe('integration-test')`.

[XXX: ensure this makes sense in Mocha, technically and semantically]

### Creating data in an integration test

### Asserting client and server side in an integration test



# Testing

1. Testing your Meteor application
  1. Basic intro to testing concepts
  2. Unit testing to ensure a module works in isolation
    1. Using stubs / mocks / spies to isolate a module
  3. Integration testing to ensure parts of the system works together
  4. End-to-end/acceptance testing to ensure the system works in totality
  5. Load/stress testing to ensure the application can handle real world load
2. Challenges of testing a Meteor application
  1. The client/server divide, ensuring data is available on the client
  2. Reactivity + testing the system responds to changing data properly
3. Generating test data
  1. How the test database is created/cleared
  2. Defining factories using `simple:factory` package
  3. Stubbing collections to create test data client side
4. Unit testing in Meteor: package testing
  1. Right now a package is the best system we have for isolating code and running tests
  2. Using practicalmeteor:mocha to run package tests with mocha
    1. Using `beforeEach` / etc to stub/mock
  3. Isolating
    1. Other packages w/ sinon
    2. Everything with https://github.com/meteor-velocity/meteor-stubs
    3. Collections with stub collections
    4. Publications with stub subscriptions
    5. Methods? w/ (something like https://github.com/meteor/meteor/pull/5561)
    6. Other bits of Meteor (e.g. `Meteor.userId()`) -- on an adhoc basis?
  4. Testing various kinds of things:
    1. General utilities
    2. Collections / Models
    3. Methods -- how to simulate `userId`
    4. Publications via calling the publish fuction, and collecting results (w/ something like https://github.com/stubailo/meteor-rest/blob/devel/packages/rest/http-subscription.js)
  5. UI components (see blaze guide and client side data stuff above)
5. Integration testing - Still not quite sure what to recommend here. Topics to cover
  1. Setting up test data and subscribing on the client
  2. Asserting both on the client and server
  3. Dealing properly with async and waiting for the right time to assert
6. Acceptance testing - let's use Selenium but in a general sense, talking about:
  1. Waiting for data to load
  2. Ensuring fixture data exists to allow test scripts to run
  3. Using 3rd party services test services like SauceLabs
7. Load testing
  1. Recap on Meteor application performance (see APM section of deployment article)
  2. Using Meteor Down to test your app using DDP
    1. Determining relevant publications
    2. Determining relevant methods
    3. Generating test data
    4. Basic structure of a test
  3. Using Selenese and Load Booster to run browser-based load tests
    1. Explanation of potential benefit over DDP-based tests
    2. Example test script
8. Continous Integration testing
  1. Spacejam + CircleCI -- not quite sure of the content here until I've done it
9. More resources / alternatives
  1. Jasmine stuff
  2. Books/etc