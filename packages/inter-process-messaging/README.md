# inter-process-messaging
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/inter-process-messaging) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/inter-process-messaging)
***

Support for sending messages between a parent process and a child process
that was spawned (by the parent) with [an IPC
channel](https://nodejs.org/api/child_process.html#child_process_options_stdio).

After spawning a child process, calling `enable(childProcess)` enables
`childProcess.sendMessage(topic, payload)`, which delivers `payload` to
any listeners in the child process that were registered for the given
`topic`. Note that `payload` must be JSON-serializable.

Child processes register themselves to receive messages by calling
`onMessage(topic, callback)`. The `callback` function may return a
`Promise`, in which case the parent will receive an array of callback
results from all children that subscribed to the given `topic`, after the
results have been resolved.

The key features that differentiate this API from the native Node
`childProcess.send(message)` and `childProcess.on("message", callback)`
APIs are (1) restricting messages to a particular topic string, and (2)
receiving a response after all listener callbacks have finished in the
child process, so that action can be taken in the parent process with
confidence that the child is done with its work.
