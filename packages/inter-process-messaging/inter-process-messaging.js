const uuid = require("uuid");

const {
  MESSAGE,
  RESPONSE,
  PING,
  PONG,
} = require("./types.js");

const hasOwn = Object.prototype.hasOwnProperty;

// These callbacks represent listeners registered on the global.process
// object by the onMessage method below.
const callbacksByTopic = new Map;

Object.assign(exports, {
  // To receive messages, a process should import this onMessage function
  // and call onMessage(topic, callback). When called, the callback will
  // receive the provided payload as its first (and only) parameter.
  // Callbacks may return a Promise, in which case the response will be
  // delayed until all results returned by callbacks registered for this
  // topic have been resolved.
  onMessage(topic, callback) {
    if (! callbacksByTopic.has(topic)) {
      callbacksByTopic.set(topic, new Set);
    }
    callbacksByTopic.get(topic).add(callback);
  },

  // Call enableSendMessage(otherProcess) to define a method called
  // otherProcess.sendMessage that takes a topic string and payload to
  // deliver to any listeners that have been registered for that topic.
  enableSendMessage(otherProcess) {
    const readyResolvers = new Map;
    const pendingMessages = new Map;
    const promisesByTopic = new Map;
    const handlersByType = Object.create(null);

    handlersByType[PING] = function ({ id }) {
      otherProcess.send({ type: PONG, id });
    };

    handlersByType[PONG] = function ({ id }) {
      const resolve = readyResolvers.get(id);
      if (typeof resolve === "function") {
        readyResolvers.delete(id);
        // This resolves the child.readyForMessages Promise created above.
        resolve();
      }
    };

    handlersByType[MESSAGE] = function ({
      responseId,
      topic,
      payload,
    }) {
      const newPromise = (
        promisesByTopic.get(topic) || Promise.resolve()
      ).then(() => {
        const results = [];
        const callbacks = callbacksByTopic.get(topic);
        if (callbacks && callbacks.size > 0) {
          callbacks.forEach(cb => results.push(cb(payload)));
          return Promise.all(results);
        }
        // Since there were no callbacks, this will be an empty array.
        return results;
      }).then(results => {
        if (responseId) {
          otherProcess.send({
            type: RESPONSE,
            responseId,
            results,
          });
        }
      }, error => {
        const serializable = {};

        // Use Reflect.ownKeys to catch non-enumerable properties, since
        // every Error property (including "message") seems to be
        // non-enumerable by default.
        Reflect.ownKeys(error).forEach(key => {
          serializable[key] = error[key];
        });

        otherProcess.send({
          type: RESPONSE,
          responseId,
          error: serializable,
        });
      });

      // Immediately update the latest promise for this topic to the
      // newPromise that we just created, before any listeners run. This
      // strategy has the effect of chaining promises by topic and thus
      // keeping messages and their responses strictly ordered, one
      // after the last. Because we always register a non-throwing error
      // handler at the end of newPromise, this queue of promises should
      // never get stalled by an earlier rejection.
      promisesByTopic.set(topic, newPromise);
    };

    handlersByType[RESPONSE] = function (message) {
      const entry = pendingMessages.get(message.responseId);
      if (entry) {
        if (hasOwn.call(message, "error")) {
          entry.reject(message.error);
        } else {
          entry.resolve(message.results);
        }
      }
    };

    otherProcess.on("message", message => {
      const handler = handlersByType[message.type];
      if (typeof handler === "function") {
        handler(message);
      }
    });

    // Call otherProcess.sendMessage(topic, payload) instead of the native
    // otherProcess.send(message) to deliver a message based on a specific
    // topic string, and receive a reliable response when the other
    // process has finished handling that message.
    otherProcess.sendMessage = function (topic, payload) {
      otherProcess.readyForMessages =
        otherProcess.readyForMessages || makeReadyPromise();

      return otherProcess.readyForMessages.then(() => {
        const responseId = uuid();

        return new Promise((resolve, reject) => {
          pendingMessages.set(responseId, { resolve, reject });

          otherProcess.send({
            type: MESSAGE,
            responseId,
            topic,
            payload
          }, error => {
            if (error) {
              reject(error);
            }
          });

        }).then(response => {
          pendingMessages.delete(responseId);
          return response;

        }, error => {
          pendingMessages.delete(responseId);
          throw error;
        });
      });
    };

    function makeReadyPromise() {
      return new Promise((resolve, reject) => {
        const pingMessage = { type: PING, id: uuid() };
        const backoff_factor = 1.1;
        let delay_ms = 50;

        readyResolvers.set(pingMessage.id, resolve);

        function poll() {
          if (readyResolvers.has(pingMessage.id)) {
            otherProcess.send(pingMessage, error => {
              if (error) {
                reject(error);
              } else {
                setTimeout(poll, delay_ms);
                delay_ms *= backoff_factor;
              }
            });
          }
        }

        poll();
      });
    }
  }
});

if (typeof process.send === "function") {
  // The process.send method is defined only when the current process was
  // spawned with an IPC channel by its parent process. In other words,
  // given that process.send can be used to send messages to the parent
  // process, it makes sense to enable process.sendMessage(topic, payload)
  // in the child-to-parent direction, too.
  exports.enableSendMessage(process);
}
