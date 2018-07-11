// This code receives, dispatches, and responds to inter-process messages
// sent by the parent (build) process. See tools/runners/run-app.js for
// the other side of this communications system.

// The process.send method is only defined when the current process was
// spawned by another process with an IPC channel.
if (typeof process.send === "function") {
  const promises = Object.create(null);

  // Listen for messages from the parent process and dispatch them to the
  // appropriate package, as identified by packageName. To receive these
  // messages, packages should export an onMessage function that takes the
  // payload as a parameter.
  process.on("message", ({
    type = "FROM_PARENT",
    responseId = null,
    packageName,
    payload,
  }) => {
    if (type === "FROM_PARENT" &&
        typeof packageName === "string") {
      // Keep the messages and their responses strictly ordered per
      // package, one after the last. The first message waits for the
      // package to call Package._define(packageName, exports).
      promises[packageName] = (
        promises[packageName] || new Promise(resolve => {
          Package._on(packageName, resolve);
        })
      ).then(
        // In order to receive messages, the package must export an
        // onMessage function.
        () => Package[packageName].onMessage(payload)
      ).then(result => {
        if (responseId) {
          // Send the response value back to the parent using the provided
          // responseId (if any).
          process.send({
            type: "FROM_CHILD",
            responseId,
            result,
          });
        }
      }, error => {
        const copy = {};
        Reflect.ownKeys(error).forEach(key => copy[key] = error[key]);
        process.send({
          type: "FROM_CHILD",
          responseId,
          error: copy,
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
