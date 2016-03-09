---
title: "Testing"
---

**NOTE** This is correct up to release 1.3-beta.12. Apologies that this is still a work in progress.

<h2 id="testing-applications">Testing your Application</h2>

There are many benefits of testing your application to ensure it works the way you think it does. Reasons include maintaining a high level of quality (especially over time as your codebase changes), allowing you to refactor and rewrite code with confidence, and concrete documentation of expected behavior. (Other developers can figure out what parts of your app are supposed to do by reading the tests!)

Automated testing allows you to do all of these things to a much greater degree and *run tests more often*, which means your codebase will remain in better shape and regress less. 

<h3 id="testing-concepts">Testing concepts</h3>

Entire books have been written on the subject of testing, so we will simply touch on some basics of testing here. The important thing to consider when writing a test is what part of the application you are trying to test, and how you are verifying the behaviour works.

If you are testing one small module of your application, you are writing a *unit test*. You'll need to take steps to *stub* and *mock* other modules that your module usually leverages in order to *isolate* each test. You'll typically also need to *spy* on actions that the module takes to verify that they occur.

If you are testing that multiple modules behave properly in concert, you are writing an *integration test*. Such tests are much more complex and may require running code both on the client and on the server to verify that communication across that divide is working as expected. Typically an integration test will still isolate a part of the entire application and directly verify results in code.

If you want to write a test that can be run against any running version of your app and verifies at the browser level that the right things happen when you push the right buttons, then you are writing an *acceptance* or *end-to-end (e2e) test*. Such tests typically try to hook into the application as little as possible, beyond perhaps setting up the right data to run a test against.

Finally you may wish to test that your application works under typical load or see how much load it can handle before it falls over. This is called a *load test* or *stress test*. Such tests can be challenging to set up and typically aren't run often but are very important for confidence before a big production launch.

<h3 id="challenges-with-meteor">Challenges of testing in Meteor</h3>

2. Challenges of testing a Meteor application
  1. The client/server divide, ensuring data is available on the client
  2. Reactivity + testing the system responds to changing data properly


<h2 id="test-modes">Test modes in Meteor</h2>

- Various ways to run your application that allows different testing modalities

- `meteor test` simply loads your test files and allows you to import modules you want to test

- `meteor test --full-app` runs your app as usual with extra test files included

- `meteor test-packages` is a way of testing Atmosphere packages, which we'll discuss in more detail in the [Writing Packages Article](writing-packages.html).

<h3 id="driver-packages">Driver packages</h3>

A test driver is a mini-application that runs in place of your app and runs each of your defined tests (each of which `import` relevant sections of your app), whilst reporting the results in some kind of user interface.

There are two main kinds of test driver packages:
  -web-reporters which are Meteor applications and display a special test reporting web UI that you can view the test results in [include a SS]

  - console-reporters that run completely on the command-line and are primary used for automated testing like [continuous integration](#ci) (as we'll see, typically PhantomJS is used to drive such tests).

While developing your app, chances are you'll want to run unit tests against a web reporter; for our example we will use a reporter that renders to Mocha's default web UI. We can add the driver simply by adding the [`avital:mocha`](https://atmospherejs.com/avital/mocha) package to our app.

```bash
meteor add avital:mocha
```

This package also doesn't do anything in development or production mode, but when our app is run in [test](#test-mode) or [full-app](#full-app-test-mode) test mode, it takes over, running test code on both the client and server, and rendering results to the browser.

In this article, we'll use the popular [Mocha](https://mochajs.org) test runner alongside the [Chai](http://chaijs.com) assertion library to test our application. In order to write tests in Mocha, we can add the [`avital:mocha`](https://atmospherejs.com/avital/mocha) package to our app.

```
meteor add avital:mocha
```

<h3 id="testing-externally">Testing externally</h3>

- Some testing utilities expect to connect to a "standard" running meteor process and "poke" it from the outside

- E2e tests are typically run in this fashion

- You may want a way within the application to generate data for such tests. Typically you'd share such code with test mode (null test driver?)

<h2 id="generating-test-data">Generating test data</h2>

- Describe testing database

- Using xolvio:cleaner

- Using factories (`dburles:factory`)

- Stubbing collections w/ factories

<h2 id="unit-testing">Unit testing</h2>

Unit testing is the process of isolating a module of code and then testing that the internals of that module work as you expect. As [we've split our code base up into ES2015 modules](structure.html) it's natural to test those modules one at a time.

By isolating a module and simply test its internal functionality, we can write tests that are *fast* and *accurate*---they can quickly tell you where a problem in your application lies. Note however that incomplete unit tests can often hide bugs because of the way they stub out dependencies. For that reason it's useful to combine unit tests with slower (and perhaps less commonly run) integration and end-to-end tests.

<h3 id="simple-unit-test">A simple unit test</h3>

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
import { mocha } from "avital:mocha";
import { chai } from "practicalmeteor:chai";
import Todos from './Todos.js'
import Factory from "mdg:factory";

const { describe, it } = mocha;
const { assert } = chai;

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

<h3 id="running-unit-tests">Running unit tests</h3>

To run the tests that our app defines, we can run a special instance of our app in test mode. To do so, we run:

```
meteor test --driver-package avital:mocha
```

This runs a special version of our application that:

 1. *Doesn't* eagerly load *any* of our application code as Meteor normally would.
 2. *Does* eagerly load any file in our application (including in `imports/` folders) that look like `*.tests.*`. 
 3. Sets the `Meteor.isTest` flag to be true.
 4. Starts up the test reporter package that we've added to our app (`avital:mocha`).

As we've defined a test file (`imports/todos/Todos.tests.js`), what this means is that the file above will be eagerly loaded, adding the `'builds correctly from factory'` test to the Mocha registry. 

To run the tests, visit http://localhost:3000 in your browser. This kicks off `avital:mocha`, which runs your tests both in the browser and on the server. It displays the test results in the browser in a Mocha test reporter:

[IMAGE]

Usually, while developing an application, it make sense to run `meteor test` on a second port (say `3100`), while also running your main application in a separate process:

```bash
# in one terminal window
meteor

# in another
meteor test --driver-package avital:mocha --port 3100
```

Then you can open two browser windows to see the app in action while also ensuring that you don't break any tests as you make changes.

<h3 id="meteor-specific-isolation">Meteor specific isolation</h3>

- JS has a tradition of test isolation techniques. Notable packages include `sinon`

- Sometimes you need something Meteor specific: (XXX: should this be in unit testing section)
  - "stub collections" -- XXX: try and use sinon on the require instead?
  - "publication collector"
  - Everything with https://github.com/meteor-velocity/meteor-stubs
1. Other packages w/ sinon
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


<h2 id="integration-testing">Integration testing</h2>

An integration test is a test that crosses module boundaries. In the simplest case, this simply means something very similar to a unit test, where you perform your isolation around multiple modules, creating a non-singular "system under test". 

Although conceptually different to unit tests, such tests typically do not need to be run any differently to unit tests and can use the same [`meteor test` mode](#running-unit-tests) and [isolation techniques](#meteor-specific-isolation) as we use for unit tests.

However, an integration test that crosses the client-server boundary of a Meteor application (where the modules under test cross that boundary) requires a different testing infrastructure, namely Meteor's "full app" testing mode. 

Let's take a look at example of both kinds of tests

<h3 id="simple-integration-test">Simple integration test</h3>

XXX: example of this

This integration test can be run the exact same way as we ran [unit tests above](#running-unit-tests).

<h3 id="full-app-integration-test">Full-app integration test</h3>

XXX: example

<h3 id="running-full-app-tests">Running full-app tests</h3>

To run the full-app tests in our application, we run:

```
meteor test --full-app --driver-package avital:mocha
```

This does the following:
 
 1. *Does* eagerly load our application code as Meteor normally would.
 2. *Also* eagerly load any file in our application (including in `imports/` folders) that look like `*.app-tests.*`. 
 3. Sets the `Meteor.isAppTest` flag to be true.
 4. Starts up the test reporter package that we've added to our app (`avital:mocha`).

The key difference is in point 1 --- our app code loads as normal. So our server runs completely as usual with the full DDP API available, for example. 

When we connect to the test instance in a browser, we want to render a testing UI rather than our app UI, so the `mocha-web-reporter` package will hide any UI of our application and overlay it with its own.


### Creating data in an integration test

### Asserting client and server side in an integration test


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
  1. Command line testing + phantomjs
  2. Running Spacejam + CircleCI

9. More resources / alternatives
  1. Jasmine stuff
  2. Books/etc
