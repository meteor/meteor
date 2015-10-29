# Forms and Methods

1. Methods
  1. The concept of a method and how it corresponds to a form
    1. A method as RPC
    2. Method authorization via `this.userId`
    3. Client simulation -- for LC and validation
    4. Throwing errors from methods and handling them on the client
    5. The `ValidationError` as a special case
  2. The `simple:method` package and the parts of a method
    1. Splitting the authorization and validation from the body
    2. Running a method w/o auth from trusted code
    3. Running the validation only (see forms below)
    4. Attaching the method to the collection's namespace
  3. The basic API of a "form" method -- throwing `ValidationError`s
  4. Using SS to build a simple form method
2. Calling methods from the client
  1. Call in the console
  2. Call in an event handler
    1. How to indicate errors to users outside of forms (flash notification pattern UX chapter)
  3. Call from a form submit
  4. Calling methods serially (best to combine to a single method)
3. Building a form in Blaze
  1. Introduction to AF
    1. Building a simple form with inputs + a submit button
    2. Pointers to documentation explaining other standard inputs + other packages.
  2. Hooking it up + displaying errors
  3. What to do if the form succeed + when (cf UX chapter)
    1. Disabling submit button during submission
4. "Realtime" form validation
  1. The Method.validate() property
  2. UX considerations -- dirty fields, tracking state (cf Blaze / UI/UX chapter)
5. Building a "quickform" by passing a schema to autoform
  1. Attaching a schema to methods
  2. [Ideally building a form for a method with a schema is now 1 line of code!]
6. Advanced form usage: uploads
  1. Adding binary support to a method + using FileReader (briefly -- find an article)
  2. Using CFS to upload better [should we just skip 1?]
  3. Uploading to a 3rd party server (just an sketch, eg. s3 signed URLs)
7. Advanced method concepts:
  1. The basic process of latency compensation
  2. Calling a method from another method, how it works with simulations + on the server
  3. The `updated` message and the `onResultReceived` callback
  4. Method retries when the client disconnects