{{#template name="basicEnvironment"}}

<h2 id="environment"><span>Environment</span></h2>

{{> autoApiBox "Meteor.isClient"}}
{{> autoApiBox "Meteor.isServer"}}

{{#note}}
`Meteor.isServer` can be used to limit where code runs, but it does
not prevent code from being sent to the client. Any sensitive code that you
don't want served to the client, such as code containing passwords or
authentication mechanisms, should be kept in the `server` directory.
{{/note}}

{{> autoApiBox "Meteor.startup"}}

On the server, the callback function will run as soon as the server
process is finished starting up. On the client, the callback function will
run as soon as the page is ready.

It's good practice to wrap all code that isn't inside template events,
template helpers, `Meteor.methods`, `Meteor.publish`, or
`Meteor.subscribe` in `Meteor.startup` so that your application code isn't
executed before the environment is ready.

For example, to create some initial data if the database is empty when the
server starts up, you might use the following pattern:

```
if (Meteor.isServer) {
  Meteor.startup(function () {
    if (Rooms.find().count() === 0) {
      Rooms.insert({name: "Initial room"});
    }
  });
}
```

If you call `Meteor.startup` on the server after the server process has
started up, or on the client after the page is ready, the callback will
fire immediately. <!-- XXX It should still fire asynchronously, though -->

{{/template}}
