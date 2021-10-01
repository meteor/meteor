# Forms

1. Forms call methods
  1. Read the method article first
  2. The basic API of a "form" method -- throwing `ValidationError`s
  3. Using mdg:validated-method to build a simple form method
2. Building a basic form to call a method
  1. HTML example with no frameworks
  2. Catching submit event
  3. Parsing data
  4. Using method to validate
  5. Displaying errors
3. Autoform
  1. Building a simple form with inputs + a submit button
  2. Pointers to documentation explaining other standard inputs + other packages
  2. Hooking it up + displaying errors
  3. What to do if the form succeed + when (cf UX chapter)
    1. Disabling submit button during submission
4. "Realtime" form validation
  1. The Method.validate() property
  2. UX considerations -- dirty fields, tracking state (cf Blaze / UI/UX chapter)
5. Building a "quickform" by passing a schema to autoform
  1. Attaching a schema to methods
  2. [Ideally building a form for a method with a schema is now 1 line of code!]
6. Advanced: file uploads
  1. Adding binary support to a method + using FileReader (briefly -- find an article)
  2. Using CFS to upload better [should we just skip 1?]
  3. Uploading to a 3rd party server (just an sketch, eg. s3 signed URLs)
