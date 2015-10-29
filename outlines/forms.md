# Forms and Methods

1. Methods
  1. The concept of a method and how it corresponds to a form
  2. The `simple:method` package and the parts of a method
  3. The basic API of a "form" method -- throwing `ValidationError`s
  4. Using SS to build a simple form method
2. Calling methods from the client
  1. Call in the console
  2. Call in an event handler
  3. Call from a form submit
  4. Calling methods serially (best to combine to a single method)
3. Building a form in Blaze
  1. Introduction to AF
  2. Hooking it up + displaying errors
  3. What to do if the form succeed + when (cf UX chapter)
4. "Realtime" form validation
  1. The Method.validate() property
  2. UX considerations -- dirty fields, tracking state (cf Blaze / UI/UX chapter)
5. Building a "quickform" by passing the schema to autoform
6. Advanced form usage: uploads
  1. Adding binary support to a method + using FileReader (briefly -- find an article)
  2. Using CFS to upload better [should we just skip 1?]
  3. Uploading to a 3rd party server (just an sketch, eg. s3 signed URLs)