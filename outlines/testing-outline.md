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