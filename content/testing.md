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

We'll use the [Mocha](https://mochajs.org) test runner alongside the [Chai](http://chaijs.com) assertion library to test our application. In order to include these in our application, we can simply add the [`practicalmeteor:mocha`](https://atmospherejs.com/practicalmeteor/mocha) package.

```bash
meteor add practicalmeteor:mocha
```

This package is a `testOnly` package, which means that adding it to our application doesn't actually do anything in development or production mode. However, in test mode (see the upcoming section), it allows us to import Mocha and start defining tests in test files. Let's see how.

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

We should test that the `Todos` collection indeed behaves as we expect and sets that field when we insert a doc. To do that, we can write a file `imports/todos/todos-tests.js`, and define a mocha test:

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

There are a few things to note here. Firstly, we've imported the Mocha and Factory packages, which are `testOnly` packages, so are only available when we run the app in test mode. Luckily we'll only import this test in test mode also!

Secondly, we've used [Mocha's API](https://mochajs.org) as well as [Chai's assertions](http://chaijs.com/api/assert/) to define a test suite, and define a test that checks that `createdAt` gets set on a todo that the factory creates.

Now, importantly, we don't `import` this test file from anywhere in our application code, so when we run the app normally, it doesn't execute. So how can we run it?


### `meteor test` -- running Meteor in test mode

So far in our application, imported everything that we need from a `client.js` and `server.js` file. We can do the same with a `test.js` (which is ordinarily ignored by the build system):

```
import 'imports/todos/todos-test.js';

```
['tests.js']

By importing the test file we defined above, we add the test case to Mocha, which means when it's time to run the test, the test case will run.

The other thing that we need to get our test working is a *test-reporter*. When we run the app in test mode, most of the default things that happen no longer occur. For instance, Flow Router will no longer attempt to route URLs for you. If you are using Blaze, the `<body>` template is no longer rendered for you. (If you are using Angular or React, you can use `Meteor.isTest` to opt out of rendering to the screen [XXX]).

As we are using Mocha for our tests, we need a test reporter that will run and report Mocha tests. Luckily, the `practical:mocha-web-reporter` [XXX: doesn't exist yet?] can do this for us.

```bash
meteor add practicalmeteor:mocha-web-reporter
```


If we add that package, we can now start the testing system via `meteor test`, then trigger a set of tests to run by visiting `localhost:3000`. If you do so, you should see something like this:

[IMAGE]

Usually, while developing an application, it make sense to run `meteor test` on a second port (say `3100`), while also running your main application

```bash
# in one terminal window
meteor

# in another
meteor test --port 3100
```

Then you can open two browser windows to see the app in action as well as ensuring you don't break any tests as you develop it.

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