{{#template name="commandLine"}}

<h2 id="command-line">Command Line Tool</h2>

#### `meteor help`

Get help on `meteor` command line usage. Running `meteor help` by itself
will list the common `meteor` commands. Running `meteor help <command>`
will print detailed help about `meteor <command>`.

#### `meteor create <name>`

Make a subdirectory called `<name>` and create a new Meteor app there.

#### `meteor run`

Serve the current app at [http://localhost:3000](http://localhost:3000)
using Meteor's local development server.

#### `meteor debug`

Run the project with Node Inspector attached, so that you can step through your server code line by line. See [`meteor debug`](#/full/meteordebug) in the full docs for more information.

#### `meteor deploy <site>`

Bundle your app and deploy it to `<site>`. Meteor provides free hosting if
you deploy to `<your app>.meteor.com` as long as `<your app>` is a name
that has not been claimed by someone else.

#### `meteor update`

Update your Meteor installation to the latest released version and then
(if `meteor update` was run from an app directory) update the packages
used by the current app to the latest versions that are compatible with
all other packages used by the app.

#### `meteor add`

Add a package (or multiple packages) to your Meteor project. To query for
available packages, use the `meteor search` command.

#### `meteor remove`

Remove a package previously added to your Meteor project. For a list of
the packages that your application is currently using, use the
`meteor list` command.

#### `meteor mongo`

Opens a MongoDB shell for viewing and/or manipulating collections stored
in the database. Note that you must already be running a server for the
current app (in another terminal window) in order for `meteor mongo` to
connect to the app's database.

#### `meteor reset`

Reset the current project to a fresh state. Removes all local data.

If you use `meteor reset` often, but you have some initial data that you don't
want to discard, consider using [`Meteor.startup`](#/basic/Meteor-startup) to
recreate that data the first time the server starts up:

```
if (Meteor.isServer) {
  Meteor.startup(function () {
    if (Rooms.find().count() === 0) {
      Rooms.insert({name: "Initial room"});
    }
  });
}
```

{{/template}}
