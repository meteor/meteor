// Chooses one of three setImmediate implementations:
//
// * Native setImmediate (IE 10, Node 0.9+)
//
// * postMessage (many browsers)
//
// * setTimeout  (fallback)
//
// The postMessage implementation is based on
// https://github.com/NobleJS/setImmediate/tree/1.0.1
//
// Don't use `nextTick` for Node since it runs its callbacks before
// I/O, which is stricter than we're looking for.
//
// Not installed as a polyfill, as our public API is `Meteor.defer`.
// Since we're not trying to be a polyfill, we have some
// simplifications:
//
// If one invocation of a setImmediate callback pauses itself by a
// call to alert/prompt/showModelDialog, the NobleJS polyfill
// implementation ensured that no setImmedate callback would run until
// the first invocation completed.  While correct per the spec, what it
// would mean for us in practice is that any reactive updates relying
// on Meteor.defer would be hung in the main window until the modal
// dialog was dismissed.  Thus we only ensure that a setImmediate
// function is called in a later event loop.
//
// We don't need to support using a string to be eval'ed for the
// callback, arguments to the function, or clearImmediate.

"use strict";

var global = this;


// IE 10, Node >= 9.1

function useSetImmediate() {
  if (! global.setImmediate)
    return null;
  else {
    var setImmediate = function (fn) {
      global.setImmediate(fn);
    };
    setImmediate.implementation = 'setImmediate';
    return setImmediate;
  }
}


// Android 2.3.6, Chrome 26, Firefox 20, IE 8-9, iOS 5.1.1 Safari

function usePostMessage() {
  // The test against `importScripts` prevents this implementation
  // from being installed inside a web worker, where
  // `global.postMessage` means something completely different and
  // can't be used for this purpose.

  if (!global.postMessage || global.importScripts) {
    return null;
  }

  // Avoid synchronous post message implementations.

  var postMessageIsAsynchronous = true;
  var oldOnMessage = global.onmessage;
  global.onmessage = function () {
      postMessageIsAsynchronous = false;
  };
  global.postMessage("", "*");
  global.onmessage = oldOnMessage;

  if (! postMessageIsAsynchronous)
    return null;

  var funcIndex = 0;
  var funcs = {};

  // Installs an event handler on `global` for the `message` event: see
  // * https://developer.mozilla.org/en/DOM/window.postMessage
  // * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html#crossDocumentMessages

  // XXX use Random.id() here?
  var MESSAGE_PREFIX = "Meteor._setImmediate." + Math.random() + '.';

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
      var index = event.data.substring(MESSAGE_PREFIX.length);
      try {
        if (funcs[index])
          funcs[index]();
      }
      finally {
        delete funcs[index];
      }
    }
  }

  if (global.addEventListener) {
    global.addEventListener("message", onGlobalMessage, false);
  } else {
    global.attachEvent("onmessage", onGlobalMessage);
  }

  var setImmediate = function (fn) {
    // Make `global` post a message to itself with the handle and
    // identifying prefix, thus asynchronously invoking our
    // onGlobalMessage listener above.
    ++funcIndex;
    funcs[funcIndex] = fn;
    global.postMessage(MESSAGE_PREFIX + funcIndex, "*");
  };
  setImmediate.implementation = 'postMessage';
  return setImmediate;
}


function useTimeout() {
  var setImmediate = function (fn) {
    global.setTimeout(fn, 0);
  };
  setImmediate.implementation = 'setTimeout';
  return setImmediate;
}


Meteor._setImmediate =
  useSetImmediate() ||
  usePostMessage() ||
  useTimeout();
