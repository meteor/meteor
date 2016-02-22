---
title: "Testing"
---

<h2 id="testing-applications">Testing your Application</h2>

There are many benefits of testing your application to ensure it works the way you think it does. Reasons include maintaining a high level of quality (especially over time as your codebase changes), allowing you to refactor and rewrite code with confidence, and concrete documentation of expected behavior. (Other developers can figure out what parts of your app are supposed to do by reading the tests!)

Automated testing allows you to do all of these things to a much greater degree and *run tests more often*, which means your codebase will remain in better shape and regress less. 

<h3 id="testing-concepts">Testing concepts</h3>

Entire books have been written on the subject of testing, so we will simply touch on some basics of testing here. The important thing to consider when writing a test is what part of the application you are trying to test, and how you are verifying the behaviour works.

If you are testing one small module of your application, you are writing a *unit test*. You'll need to take steps to *stub* and *mock* other modules that your module usually leverages in order to *isolate* each test. You'll typically also need to *spy* on actions that the module takes to verify that they occur.

If you are testing that multiple modules behave properly in concert, you are writing an *integration test*. Such tests are much more complex and may require running code both on the client and on the server to verify that communication across that divide is working as expected. Typically an integration test will still isolate a part of the entire application and directly verify results in code.

If you want to write a test that can be run against any running version of your app and verifies at the browser level that the right things happen when you push the right buttons, then you are writing an *acceptance* or *end-to-end (e2e) test*. Such tests typically try to hook into the application as little as possible, beyond perhaps setting up the right data to run a test against.

Finally you may wish to test that your application works under typical load or see how much load it can handle before it falls over. This is called a *load test* or *stress test*. Such tests can be challenging to set up and typically aren't run often but are very important for confidence before a big production launch.

<h3 id="isolation-techniques">Isolation techniques</h3>

http://martinfowler.com/articles/mocksArentStubs.html

<h3 id="challenges-with-meteor">Challenges of testing in Meteor</h3>



<h2 id="generating-test-data">Generating test data</h2>


## Unit testing in Meteor

Unit testing is the process of isolating a module of code and then testing that the internals of that module work as you expect.

As we've organized our application into modules based on features, collections and utilities, it is natural to use that same breakdown to test those modules.

### Unit testing with Mocha

We'll use the popular [Mocha](https://mochajs.org) test runner alongside the [Chai](http://chaijs.com) assertion library to test our application. In order to write tests in Mocha, we can add the [`practicalmeteor:mocha`](https://atmospherejs.com/practicalmeteor/mocha) package to our app.

```bash
meteor add practicalmeteor:mocha
```

This package provides a way for test files to register tests and for a [test driver](#test-driver) to run them.

### Defining a Mocha test

In the Todos example app, we have a special `TodosCollection` that sets a `createdAt` field whenever we insert a new todo item. 

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

We should test that the `Todos` collection indeed behaves as we expect and sets that field when we insert a doc. To do that, we can write a file `imports/todos/todos.tests.js`, and define a Mocha test in it:

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

Secondly, we've used [Mocha's API](https://mochajs.org) as well as [Chai's assertions](http://chaijs.com/api/assert/) to define a test suite and define a test that checks that `createdAt` gets set on a todo that the factory creates.

### Adding a test driver

A test driver is a mini-application that runs in place of your app and runs each of your defined tests (each of which `import` relevant sections of your app), whilst reporting the results in some kind of user interface.

There are two main kinds of test driver packages; web-reporters which are Meteor applications and display a special test reporting web UI that you can view the test results in; and console-reporters that run completely on the command-line and are primary used for automated testing like [continuous integration](#ci) [XXX: we should probably explain more about how phantom is involved in command-line testing?]

While developing your app, chances are you'll want to run unit tests against a web reporter; for our example we will use a reporter that renders to Mocha's default web UI. We can add the driver simply by adding the [`practicalmeteor:mocha-web-reporter`](https://atmospherejs.com/practicalmeteor/mocha-web-reporter) package to our app.

```bash
meteor add practicalmeteor:mocha-web-reporter
```

This package also doesn't do anything in development or production mode, but when our app is run in [unit](#unit-test-mode) or [integration](#integration-test-mode) test mode, it takes over, running test code on both the client and server, and rendering results to the browser.

### Unit test mode

To run the unit tests that our app defines, we can run a special instance of our app in unit test mode. To do so, we run:

```
meteor test --unit
```

This runs a special version of our application that:

 1. *Doesn't* eagerly load *any* of our application code as Meteor normally would.
 2. *Does* eagerly load any file in our application (including in `imports/` folders) that look like `*.tests.*`. 
 3. Sets the `Meteor.isTest` and `Meteor.isUnitTest` flags to be true.
 4. Starts up the test reporter package that we've added to our app (`practicalmeteor:mocha-web-reporter`).

As we've defined a test file (`imports/todos/Todos.tests.js`), what this means is that the file above will be eagerly loaded, adding the `'builds correctly from factory'` test to the Mocha registry. 

To run the tests, visit http://localhost:3000 in your browser. This kicks off `mocha-web-reporter`, which runs your unit tests both in the browser and on the server. It displays the test results in the browser in a Mocha test reporter:

[IMAGE]

Usually, while developing an application, it make sense to run `meteor test` on a second port (say `3100`), while also running your main application in a separate process:

```bash
# in one terminal window
meteor

# in another
meteor test --port 3100
```

Then you can open two browser windows to see the app in action while also ensuring that you don't break any tests as you make changes.

## Integration testing

XXX: This is still a very rough sketch at this point. I want to get more of a feel for what these tests look like and what should happen.

Integration testing means invoking and asserting properties of your application while different modules work in concert. Meteor's integration testing mode runs your application as usual but replaces the user interface with a test reporter that can runs test cases both on the client and server.

### Integration test mode

To run the integration tests in our application, we run:

```
meteor test --integration
```

This does the following:
 
 1. *Does* eagerly load our application code as Meteor normally would.
 2. *Also* eagerly load any file in our application (including in `imports/` folders) that look like `*.tests.*`. 
 3. Sets the `Meteor.isTest` and `Meteor.isIntegrationTest` flags to be true.
 4. Starts up the test reporter package that we've added to our app (`practicalmeteor:mocha-web-reporter`).

The key difference is in point 1 --- our app code loads as normal. So our server runs completely as usual with the full DDP API available, for example. 

When we connect to the test instance in a browser, we want to render a testing UI rather than our app UI, so the `mocha-web-reporter` package will remove any UI of our application and replace it with its own. Also packages (such as `flow-router`) that might take actions based on browser connectivity should be careful to not do so when `Meteor.isTest` is set.

### Writing an integration test

To write an integration test in Mocha, we do something similar to our unit test but wrap it in a `describe('integration-test')`.

[XXX: ensure this makes sense in Mocha, technically and semantically]

### Creating data in an integration test

### Asserting client and server side in an integration test



# Testing

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
