# dispatch:phantomjs-tests

This package exports a `startPhantom` function for server code, which runs your client tests within a PhantomJS page. Meteor test driver packages can depend on this package. See the example implementation here: https://github.com/DispatchMe/meteor-mocha-phantomjs

## Usage

In your test driver package `package.js` file, add

```js
api.use('dispatch:phantomjs-tests@0.0.1', 'server');
```

Then in your server code, do something similar to this:

```js
import { startPhantom } from 'meteor/dispatch:phantomjs-tests';

function start() {
  startPhantom({
    stdout(data) {
      console.log(data.toString());
    },
    stderr(data) {
      console.log(data.toString());
    },
    done(failureCount) {
      // Your code to run when client tests are done running
    },
  });
}

export { start };
```

And in your client code, you need to set some properties on `window` so that the PhantomJS script knows what is happening:

```js
// Run the client tests. Meteor calls the `runTests` function exported by
// the driver package on the client.
function runTests() {
  // These `window` properties are all used by the phantomjs script to
  // know what is happening.
  window.testsAreRunning = true;
  mocha.run((failures) => {
    window.testsAreRunning = false;
    window.testFailures = failures;
    window.testsDone = true;
  });
}

export { runTests };
```
