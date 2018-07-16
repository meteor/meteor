const callbacksByTopic = new Map;

Object.assign(exports, {
  onMessage(topic, callback) {
    if (! callbacksByTopic.has(topic)) {
      callbacksByTopic.set(topic, new Set);
    }
    callbacksByTopic.get(topic).add(callback);
  }
});

// This code receives, dispatches, and responds to inter-process messages
// sent by the parent process. See parent.js for the other side of this
// communications system.

// The process.send method is only defined when the current process was
// spawned by another process with an IPC channel.
if (typeof process.send === "function") {
  const promisesByTopic = Object.create(null);

  // Listen for messages from the parent process and dispatch them to the
  // appropriate listeners, according to the topic string. To receive
  // these messages, packages should import { onMessage } from
  // "meteor/inter-process-messaging" and call onMessage(topic, callback).
  // When called, the callback will receive the provided payload as a
  // parameter.
  process.on("message", ({
    type = "FROM_PARENT",
    responseId = null,
    topic,
    payload,
  }) => {
    if (type === "FROM_PARENT" &&
        typeof topic === "string") {
      // Keep the messages and their responses strictly ordered per topic,
      // one after the last. Because we always register a non-throwing
      // error handler below, this queue of promises should never get
      // stalled by an earlier rejection.
      promisesByTopic[topic] = (
        promisesByTopic[topic] || Promise.resolve()
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
          process.send({
            type: "FROM_CHILD",
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

        process.send({
          type: "FROM_CHILD",
          responseId,
          error: serializable,
        });
      });
    }
  });

  // Let the parent process know this child process is ready to receive
  // messages.
  process.send({
    type: "CHILD_READY",
    pid: process.pid,
  });
}
