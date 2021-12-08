# Prefer `Session.equals` in conditions (prefer-session-equals)

Using `Session.equals('foo', bar)` toggles fewer invalidations compared to `Session.get('foo') === bar`. This rule warns when unnecessary invalidations would be triggered.


## Rule Details

While the above is only true for scalar types, this rule encourages use of `Session.equals` in all conditionals.

The following patterns are considered warnings:

```js
if (Session.get("foo")) {/* ... */}

if (Session.get("foo") == bar) {/* ... */}

if (Session.get("foo") === bar) {/* ... */}

Session.get("foo") ? true : false

Session.get("foo") === bar ? true : false
```

The following patterns are not warnings:

```js
if (Session.equals("foo", true)) {/* ... */}

if (Session.equals("foo", 1)) {/* ... */}

if (Session.equals("foo", "hello")) {/* ... */}

if (Session.equals("foo", bar)) {/* ... */}

if (_.isEqual(Session.get("foo"), otherValue)) {/* ... */}

Session.equals("foo", true) ? true : false
```

```js
const foo = Session.get("foo")
if (foo === 'bar') {/* ... */}
```

## When Not To Use It

Turn this rule off when you are comparing compound types, e.g. Arrays.


## Further Reading

- http://docs.meteor.com/#/full/session_equals


## Possible Improvements

* Track which variables were set through `Session.get` and warn when they are used in conditions
