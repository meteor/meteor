# Core API for Session (session)

Prevent misusage of [Session](http://docs.meteor.com/#/full/session).


## Rule Details

This rule aims to prevent errors when using Publications and Subscriptions. It verifies `Session` is used in the correct environments.

The following patterns are considered warnings:

```js

Session.set('foo')

```

```js

Session.setDefault('foo')

```


```js

Session.set('foo', true, 'bar')

```


```js

if (Meteor.isServer) {
  Session.set('foo')
}

```


```js

Session.get('foo', true)

```


```js

Session.get()

```


```js

Session.equals('foo')

```

The following patterns are not warnings:

```js

Session.set('foo', true)

```

```js

Session.setDefault('foo', true)

```

```js

Session.get('foo')

```

```js

Session.equals('foo', true)

```

### Options

#### no-equal

By default this rule does not warn when trying to call `Session.equal`. Usually a call to `Session.equals` is meant instead.
To warn when using `Session.equal`, configure the rule as

```

session: [2, "no-equal"]

```

With this configuration, the rule will warn on this pattern:

```js

Session.equal('foo', 'bar')

```

## When Not To Use It

Disable this rule if you are using [no-session](./no-session.md).

## Further Reading

- http://docs.meteor.com/#/full/session
