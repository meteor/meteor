# Core API for check and Match (check)

Prevent misusage of [Check](http://docs.meteor.com/#/full/check).


## Rule Details

This rule aims to prevent errors when using `check` and `Match`.

The following patterns are considered warnings:

```js

check()          // missing arguments

```

```js

Match.test()     // missing argument

```

The following patterns are not warnings:

```js

check(foo, String)

```

## When Not To Use It

Disable this rule if you are not using the `check` package.

## Further Reading

- https://github.com/meteor/meteor/tree/devel/packages/check
- http://docs.meteor.com/#/full/check
