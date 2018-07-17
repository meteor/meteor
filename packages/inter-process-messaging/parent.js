const uuid = require("uuid");
const {
  MESSAGE_FROM_PARENT,
  RESPONSE_FROM_CHILD,
  CHILD_READY,
} = require("./types.js");
const hasOwn = Object.prototype.hasOwnProperty;

// Call enableSendMessage(childProcess) to define a method called
// childProcess.sendMessage that takes a topic string and payload to
// deliver to any listeners that have been registered for that topic.

Object.assign(exports, {
  enableSendMessage(childProcess) {
    const pendingMessages = new Map;
    const childProcessReadyResolvers = new Map;

    childProcess.readyForMessages = new Promise(resolve => {
      childProcessReadyResolvers.set(childProcess.pid, resolve);
    });

    childProcess.on("message", message => {
      if (message.type === CHILD_READY) {
        const resolve = childProcessReadyResolvers.get(message.pid);
        // This resolves the child.readyForMessages Promise created above.
        if (typeof resolve === "function") {
          resolve();
        }

      } else if (message.type === RESPONSE_FROM_CHILD) {
        const entry = pendingMessages.get(message.responseId);
        if (entry) {
          if (hasOwn.call(message, "error")) {
            entry.reject(message.error);
          } else {
            entry.resolve(message.results);
          }
        }
      }
    });

    childProcess.sendMessage = function (topic, payload) {
      return childProcess.readyForMessages.then(() => {
        const responseId = uuid();

        return new Promise((resolve, reject) => {
          pendingMessages.set(responseId, { resolve, reject });

          childProcess.send({
            type: MESSAGE_FROM_PARENT,
            responseId,
            topic,
            payload
          }, error => {
            if (error) {
              reject(error);
            }
          });

        }).then(results => {
          pendingMessages.delete(responseId);
          return results;

        }, error => {
          pendingMessages.delete(responseId);
          throw error;
        });
      });
    };
  }
});
