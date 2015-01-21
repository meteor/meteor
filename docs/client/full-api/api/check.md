{{#template name="apiCheck"}}

<h2 id="check_package"><span>Check</span></h2>

The `check` package includes pattern checking functions useful for checking
the types and structure of variables and an [extensible
library of patterns](#matchpatterns) to specify which types you are expecting.

{{> autoApiBox "check"}}

Meteor methods and publish functions take arbitrary [EJSON](#ejson) types as
arguments, but most arguments are expected to be of a particular type. `check`
is a lightweight function for checking that arguments and other
values are of the expected type. For example:

    Meteor.publish("chats-in-room", function (roomId) {
      // Make sure roomId is a string, not an arbitrary mongo selector object.
      check(roomId, String);
      return Chats.find({room: roomId});
    });

    Meteor.methods({addChat: function (roomId, message) {
      check(roomId, String);
      check(message, {
        text: String,
        timestamp: Date,
        // Optional, but if present must be an array of strings.
        tags: Match.Optional([String])
      });

      // ... do something with the message ...
    }});

If the match fails, `check` throws a `Match.Error` describing how it failed. If
this error gets sent over the wire to the client, it will appear only as
`Meteor.Error(400, "Match Failed")`. The failure details will be written to the
server logs but not revealed to the client.

{{> autoApiBox "Match.test"}}

`Match.test` can be used to identify if a variable has a certain structure.

```js
// will return true for {foo: 1, bar: "hello"} or similar
Match.test(value, {foo: Match.Integer, bar: String});

// will return true if value is a string
Match.test(value, String);

// will return true if value is a String or an array of Numbers
Match.test(value, Match.OneOf(String, [Number]));
```

This can be useful if you have a function that accepts several different kinds
of objects, and you want to determine which was passed in.

{{> apiBoxTitle name="Match Patterns" id="matchpatterns"}}

The following patterns can be used as pattern arguments to
[`check`](#check) and `Match.test`:


<dl>
{{#dtdd "<code>Match.Any</code>"}}
Matches any value.
{{/dtdd}}

{{#dtdd "<code>String</code>, <code>Number</code>, <code>Boolean</code>, <code>undefined</code>, <code>null</code>"}}
Matches a primitive of the given type.
{{/dtdd}}

{{#dtdd "<code>Match.Integer</code>"}}
Matches a signed 32-bit integer. Doesn't match `Infinity`, `-Infinity`, or `NaN`.
{{/dtdd}}

{{#dtdd "<code>[<em>pattern</em>]</code>"}}
A one-element array matches an array of elements, each of which match
*pattern*. For example, `[Number]` matches a (possibly empty) array of numbers;
`[Match.Any]` matches any array.
{{/dtdd}}

{{#dtdd "<code>{<em>key1</em>: <em>pattern1</em>, <em>key2</em>: <em>pattern2</em>, ...}</code>"}}
Matches an Object with the given keys, with values matching the given patterns.
If any *pattern* is a `Match.Optional`, that key does not need to exist
in the object. The value may not contain any keys not listed in the pattern.
The value must be a plain Object with no special prototype.
{{/dtdd}}

{{#dtdd "<code>Match.ObjectIncluding({<em>key1</em>: <em>pattern1</em>, <em>key2</em>: <em>pattern2</em>, ...})</code>"}}
Matches an Object with the given keys; the value may also have other keys
with arbitrary values.
{{/dtdd}}

{{#dtdd "<code>Object</code>"}}
Matches any plain Object with any keys; equivalent to
`Match.ObjectIncluding({})`.
{{/dtdd}}

{{#dtdd "<code>Match.Optional(<em>pattern</em>)</code>"}} Matches either
`undefined` or something that matches pattern. If used in an object this matches
only if the key is not set as opposed to the value being set to `undefined`.

    // In an object
    var pat = { name: Match.Optional(String) };
    check({ name: "something" }, pat) // OK
    check({}, pat) // OK
    check({ name: undefined }, pat) // Throws an exception

    // Outside an object
    check(undefined, Match.Optional(String)); // OK

{{/dtdd}}

{{#dtdd "<code>Match.OneOf(<em>pattern1</em>, <em>pattern2</em>, ...)</code>"}}
Matches any value that matches at least one of the provided patterns.
{{/dtdd}}

{{#dtdd "Any constructor function (eg, <code>Date</code>)"}}
Matches any element that is an instance of that type.
{{/dtdd}}

{{#dtdd "<code>Match.Where(<em>condition</em>)</code>"}}
Calls the function *condition* with the value as the argument. If *condition*
returns true, this matches. If *condition* throws a `Match.Error` or returns
false, this fails. If *condition* throws any other error, that error is thrown
from the call to `check` or `Match.test`. Examples:

    check(buffer, Match.Where(EJSON.isBinary));

    NonEmptyString = Match.Where(function (x) {
      check(x, String);
      return x.length > 0;
    });
    check(arg, NonEmptyString);
{{/dtdd}}
</dl>

{{/template}}