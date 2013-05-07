// Choose the best available setImmediate implementation.
//
// Based on https://github.com/NobleJS/setImmediate#readme
// version 1.0.1 (https://github.com/NobleJS/setImmediate/tree/1.0.1)
//
// Changes:
//
// * Not installed as a polyfill, as our public API is `Meteor.defer`.
//
// * `nextTick` is not used for Node since `nextTick` runs its
// callbacks before I/O, which is stricter than we're looking for.
//
// * If one invocation of a setImmediate callback pauses itself by a
// call to alert/prompt/showModelDialog, the original polyfill
// implementation ensured that no setImmedate callback would run until
// the first invocation completed.  While correct per the spec
// https://dvcs.w3.org/hg/webperf/raw-file/tip/specs/setImmediate/Overview.html,
// what it would mean for us in practice is that any reactive updates
// relying on Meteor.defer would be hung in the main window until the
// modal dialog was dismissed.
//
// * Don't support using a string to be eval'ed for the callback.
//
// * The code isn't wrapped in a closure here because that's done by
// the package system.
//
// * Don't implement clearImmediate.
//
// * Reformatted.

"use strict";

var global = this;

var tasks = (function () {
  function Task(handler, args) {
    this.handler = handler;
    this.args = args;
  }

  Task.prototype.run = function () {
    // Choice of `thisArg` is not in the setImmediate spec;
    // `undefined` is in the setTimeout spec though:
    // http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html
    this.handler.apply(undefined, this.args);
  };

  var nextHandle = 1; // Spec says greater than zero
  var tasksByHandle = {};
  var currentlyRunningATask = false;

  return {
    addFromSetImmediateArguments: function (args) {
      var handler = args[0];
      var argsToHandle = Array.prototype.slice.call(args, 1);
      var task = new Task(handler, argsToHandle);

      var thisHandle = nextHandle++;
      tasksByHandle[thisHandle] = task;
      return thisHandle;
    },
    runIfPresent: function (handle) {
      // From the spec: "Wait until any invocations of this algorithm
      // started before this one have completed."  So if we're
      // currently running a task, we'll need to delay this
      // invocation.
      if (!currentlyRunningATask) {
        var task = tasksByHandle[handle];
        if (task) {
          currentlyRunningATask = true;
          try {
              task.run();
          } finally {
              delete tasksByHandle[handle];
              currentlyRunningATask = false;
          }
        }
      } else {
        // Delay by doing a setTimeout. setImmediate was tried
        // instead, but in Firefox 7 it generated a "too much
        // recursion" error.
        // XXX bad idea on iOS
        global.setTimeout(function () {
            tasks.runIfPresent(handle);
        }, 0);
      }
    },
  };
}());

function canUseMessageChannel() {
  return !!global.MessageChannel;
}

function canUsePostMessage() {
  // The test against `importScripts` prevents this implementation
  // from being installed inside a web worker, where
  // `global.postMessage` means something completely different and
  // can't be used for this purpose.

  if (!global.postMessage || global.importScripts) {
    return false;
  }

  var postMessageIsAsynchronous = true;
  var oldOnMessage = global.onmessage;
  global.onmessage = function () {
      postMessageIsAsynchronous = false;
  };
  global.postMessage("", "*");
  global.onmessage = oldOnMessage;

  return postMessageIsAsynchronous;
}

function canUseReadyStateChange() {
  return ("document" in global &&
          "onreadystatechange" in global.document.createElement("script"));
}

function messageChannelImplementation() {
  var channel = new global.MessageChannel();
  channel.port1.onmessage = function (event) {
    var handle = event.data;
    tasks.runIfPresent(handle);
  };
  return = function () {
    var handle = tasks.addFromSetImmediateArguments(arguments);

    channel.port2.postMessage(handle);

    return handle;
  };
}

function postMessageImplementation() {
  // Installs an event handler on `global` for the `message` event: see
  // * https://developer.mozilla.org/en/DOM/window.postMessage
  // * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html#crossDocumentMessages

  var MESSAGE_PREFIX = "Meteor._setImmediate." + Math.random();

  function isStringAndStartsWith(string, putativeStart) {
    return (typeof string === "string" &&
            string.substring(0, putativeStart.length) === putativeStart);
  }

  function onGlobalMessage(event) {
    // This will catch all incoming messages (even from other
    // windows!), so we need to try reasonably hard to avoid letting
    // anyone else trick us into firing off. We test the origin is
    // still this window, and that a (randomly generated)
    // unpredictable identifying prefix is present.
    if (event.source === global &&
        isStringAndStartsWith(event.data, MESSAGE_PREFIX)) {
      var handle = event.data.substring(MESSAGE_PREFIX.length);
      tasks.runIfPresent(handle);
    }
  }
  if (global.addEventListener) {
    global.addEventListener("message", onGlobalMessage, false);
  } else {
    global.attachEvent("onmessage", onGlobalMessage);
  }

  return function () {
    var handle = tasks.addFromSetImmediateArguments(arguments);

    // Make `global` post a message to itself with the handle and
    // identifying prefix, thus asynchronously invoking our
    // onGlobalMessage listener above.
    global.postMessage(MESSAGE_PREFIX + handle, "*");

    return handle;
  };
}

function readyStateChangeImplementation() {
  return function () {
    var handle = tasks.addFromSetImmediateArguments(arguments);

    // Create a <script> element; its readystatechange event will be
    // fired asynchronously once it is inserted into the document. Do
    // so, thus queuing up the task. Remember to clean up once it's
    // been called.
    var scriptEl = global.document.createElement("script");
    scriptEl.onreadystatechange = function () {
        tasks.runIfPresent(handle);

        scriptEl.onreadystatechange = null;
        scriptEl.parentNode.removeChild(scriptEl);
        scriptEl = null;
    };
    global.document.documentElement.appendChild(scriptEl);

    return handle;
  };
}

function setTimeoutImplementation() {
  return function () {
    var handle = tasks.addFromSetImmediateArguments(arguments);

    global.setTimeout(function () {
      tasks.runIfPresent(handle);
    }, 0);

    return handle;
  };
}

if (global.setImmediate) {
  Meteor._setImmediate = global.setImmediate;
  Meteor._setImmediateImplementation = 'setImmediate';
}
else if (canUsePostMessage()) {
  // For non-IE10 modern browsers
  Meteor._setImmediate = postMessageImplementation();
  Meteor._setImmediateImplementation = 'postMessage';
}
else if (canUseMessageChannel()) {
  // For web workers, where supported
  Meteor._setImmediate = messageChannelImplementation();
  Meteor._setImmediateImplementation = 'messageChannel';
}
else if (canUseReadyStateChange()) {
  // For IE 6–8
  Meteor._setImmediate = readyStateChangeImplementation();
  Meteor._setImmediateImplementation = 'readyStateChange';
}
else {
  // For older browsers
  Meteor._setImmediate = setTimeoutImplementation();
  Meteor._setImmediateImplementation = 'setTimeout';
}
