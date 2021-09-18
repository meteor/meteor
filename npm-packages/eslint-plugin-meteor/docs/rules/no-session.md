# Prevent usage of Session (no-session)

This rule prevents any usage of Session. Session variables live in a global namespace, which is bad practice. [reactive-dict](https://github.com/meteor/meteor/tree/devel/packages/reactive-dict) should be used instead.

## Rule Details

This rule enforces a style without `Session`.

The following patterns are considered warnings:

```js

Session.set('foo')
Session.get('foo')
Session.all()
Session.clear()

```

The following patterns are not warnings:

```js

Session = true
console.log(Session)

```

## When Not To Use It

If you are working on a project using few globals then you can disable this rule.

## Further Reading

* https://meteor.hackpad.com/Proposal-Deprecate-Session-in-favor-of-ReactiveDict-0wbRKtE4GZ9
* http://c2.com/cgi/wiki?GlobalVariablesAreBad
