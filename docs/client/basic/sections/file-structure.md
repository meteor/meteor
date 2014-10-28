{{#template name="basicFileStructure"}}

## File Structure

Meteor is very flexible about how you structure the files in your app. It
automatically loads all of your files, so there is no need to use `<script>` or
`<link>` tags to include JavaScript or CSS.

### Default file loading

If files are outside of the special directories listed below, Meteor does the following:

1. HTML templates are compiled and sent to the client. See [the templates section](#/basic/templates) for more details.
2. CSS files are sent to the client. In production mode they are automatically concatenated and minified.
3. JavaScript is loaded on the client and the server. You can use `Meteor.isClient` and `Meteor.isServer` to control where certain blocks of code run.

If you want more control over which JavaScript code is loaded on the client and
the server, you can use the special directories listed below.

### Special directories

#### `/client`

Any files here are only served to the client. This is a good place to keep your
HTML, CSS, and UI-related JavaScript code.

#### `/server`

Any files in this directory are only used on the server, and are never sent to
the client. Use `/server` to store source files with sensitive logic or data
that should not be visible to the client.

#### `/public`

Files in `/public` are served to the client as-is. Use this to store assets such
as images. For example, if you have an image located at
`/public/background.png`, you can include it in your HTML with `<img src='/background.png'/>` or in your CSS with `background-image:
url(/background.png)`. Note that `/public` is not part of the image URL.

#### `/private`

These files can only be accessed by server code through [`Assets`](#assets) API and are not accessible to the client.

Read more about file load order and special directories in the [Structuring Your
App section](#/full/structuringyourapp) of the full API documentation.

{{/template}}