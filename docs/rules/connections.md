# Core API for connections (connections)

Prevent misusage of [connections](http://docs.meteor.com/#/full/connections).


## Rule Details

This rule aims to prevent errors when using connections.

The following patterns are considered warnings:

```js

Meteor.status(true)      // No argument expected

```

```js

Meteor.reconnect(true)   // No argument expected

```

```js

Meteor.disconnect(true)  // No argument expected

```

```js

Meteor.onConnection()    // One argument expected

```


```js

DDP.connect()            // missing argument

```

The following patterns are not warnings:

```js

Meteor.status()

```

```js

Meteor.reconnect()

```

```js

Meteor.disconnect()

```

```js

Meteor.onConnection(function () {})

```

```js

DDP.connect('http://localhost:3000')

```

## Further Reading

- http://docs.meteor.com/#/full/connections
