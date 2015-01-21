# autoupdate

This package is the heart of Meteor's Hot Code Push functionality. It
has a client component and a server component component. The client
component uses a DDP API provided by the server to subscribe to the
version ID of the most recent build of the app's client. When it sees
that a new version is available, it uses the
[reload](https://atmospherejs.com/meteor/reload) package to gracefully
save the app's state and reload it in place.

`autoupdate` is part of the [Webapp](https://www.meteor.com/webapp)
project.
