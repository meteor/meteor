# Meteor Core API (core)

This rules prevents misuse of the Meteor core API.


## Rule Details

This rule aims to prevent reassigning or misusing any part of the Meteor core API, which consists of:

- `Meteor.isClient`
- `Meteor.isServer`
- `Meteor.isCordova`
- `Meteor.startup`
- `Meteor.wrapAsync`
- `Meteor.absoluteUrl`
- `Meteor.settings`
- `Meteor.release`

The following patterns are considered warnings:

```js

// reassigning any part of the Meteor core API
Meteor.isClient = true

```

```js

// calling Meteor.startup with anything but one argument
Meteor.startup()
Meteor.startup(foo, bar)

```

```js

// calling Meteor.wrapAsync with an invalid argument count
Meteor.wrapAsync()
Meteor.wrapAsync(function () {}, context, foo)

```

```js

// calling Meteor.absoluteUrl with an invalid argument count
Meteor.absoluteUrl(foo, bar, baz)

```

The following patterns are not warnings:

```js

Meteor.startup(x)
Meteor.startup(() => {})
Meteor.startup(function () {})

```

```js

if (Meteor.isClient) {
  console.log('Hello world')
}

```

```js

Meteor.wrapAsync(function () {})
Meteor.wrapAsync(function () {}, context)

```

```js

Meteor.absoluteUrl()
Meteor.absoluteUrl('/foo')
Meteor.absoluteUrl('/foo', { secure: true })

```

## Further Reading

* http://docs.meteor.com/#/full/core
