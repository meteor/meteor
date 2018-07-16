# inter-process-messaging
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/inter-process-messaging) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/inter-process-messaging)
***

Support for sending messages from a parent process to a child process that
was spawned (by the parent) with [an IPC
channel](https://nodejs.org/api/child_process.html#child_process_options_stdio).

After spawning a child process, the parent may call
`enableSendMessage(childProcess)` which enables calling
`childProcess.sendMessage(topic, payload)` with a topic string and a
JSON-serializable payload object.

Child processes receive messages by calling `onMessage(topic, callback)`.
The `callback` function may return a `Promise`, in which case the parent
will receive an array of callback results from all children that
subscribed to the given `topic`, after the results have been resolved.

The key features that differentiate this API from the native
`childProcess.send(message)` API are the ability to restrict messages to a
particular topic string, and receive a response after all `callbacks` have
completed in the child process, so that action can be taken in the parent
process with confidence that the child has finished its work.

This system is currently designed for sending one-to-many messages from
the build process to the server process in development, though it could be
generalized to support other kinds of inter-process communication in the
future.
