# Core API for methods (methods)

Prevent misusage of [methods](http://docs.meteor.com/#/full/meteor_methods).


## Rule Details

This rule aims to prevent errors when using methods.

The following patterns are considered warnings:

```js

Meteor.methods()          // missing argument

```

```js

Meteor.call()             // missing argument

```

```js

Meteor.apply()            // missing argument

```

```js

new Meteor.Error()        // missing argument

```

```js

Meteor.methods({
  foo: function () {
    this.userId = true    // can not be changed
    this.isSimulation++   // can not be changed
    this.connection++     // update not allowed

    this.unblock = true   // can not be changed; allowed on server only
    this.setUserId()      // missing argument; allowed on server only
  }
})

```

The following patterns are not warnings:

```js

Meteor.call('foo')

```

```js

Meteor.apply('foo', [])

```

```js

Meteor.methods({
  foo: function () {
    return Bar.find({ _id: this.userId })
  }
})

```


## Limitations

- Does not verify usage of DDPRateLimiter.

## Further Reading

- http://docs.meteor.com/#/full/meteor_methods
