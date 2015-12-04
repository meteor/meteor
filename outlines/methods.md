# Methods

1. What are Methods?
  1. Methods are your app's data input API methods, like a POST request in REST
  2. One of the most advanced RPC systems for the web, with lots of "hidden" benefits that make your life easier
  2. Implementation in DDP
    1. Method simulation executed on client
    2. Method message sent over DDP: name, arguments
    3. Method executed on the server
    4. Return value sent to the client
    5. After all DB operations are complete and published, updated message sent to the client
    6. Method callback fires with the result
  3. Methods can be used for data loading, but have disadvantages compared to publications
  4. Benefits of the Method system
    1. Non-blocking but synchronous-looking (other methods from the same client won't run at the same time unless you use this.unblock)
    2. Methods always execute in the same order, and results come back in the same order
    3. Deeply optimized for optimistic UI because of change tracking
2. Defining a method
  1. Simple Meteor core version
  2. Meteor core version with boilerplate
  3. mdg:validated-method version
  4. What it means to define a method on the server only vs. client and server
3. Calling a method
  1. Call in the console
  2. Call in an event handler
    1. How to indicate errors to users outside of forms (flash notification pattern UX chapter)
  3. Call from a form submit
  4. Calling methods serially (best to combine to a single method)
4. Error handling
  1. Throwing errors from a method
  2. Throwing an error from the simulation prevents the server call
  3. Catching errors on the client from the callback
  4. ValidationError
5. Wiring up a method to a simple form
  1. Basically, the task adding code from the todos app
  2. Read more in the forms article
6. Advanced concepts
  1. Calling a method from inside another method on the server
  2. Consistent ID generation and optimistic UI
  3. The `onResultReceived` callback, and when to use it
  4. Method retries, and figuring out that a method didn't succeed
