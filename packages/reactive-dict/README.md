# reactive-dict

This package provide `ReactiveDict`, a general-purpose reactive
datatype for use with
[tracker](https://atmospherejs.com/meteor/tracker). It provides all of
the functionality of the `Session` object documented in the [main
Meteor docs](https://docs.meteor.com/#session), such as reactive
`get`, `set`, and `equals` functions.

If you provide a name to its constructor, its contents will be saved across Hot
Code Push client code updates.

Example usage:

```js
var dict = new ReactiveDict('myDict');
dict.set("weather", "cloudy");
Tracker.autorun(function () { console.log("now " + dict.get("weather")); });
// now cloudy
dict.set("weather", "sunny");
// now sunny
```

For more information, see the [Tracker project
page](https://www.meteor.com/tracker).

## Future work

Unify with [reactive-var](https://atmospherejs.com/meteor/reactive-var).
