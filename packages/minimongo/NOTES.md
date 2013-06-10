## CORE FUNCTIONALITY THAT'S MISSING ##

In update, $pull can't take a selector like {$gt: 3} (but it can take
{x: 3}, or {x: {$gt: 3}} -- basically, selectors that match documents
can be used, but selectors that are intended to match non-document
values won't work.)

In update, we don't support '$' to indicate the matched array object
as in {$set: {'a.$.x': 12}}.

Sort does not support subkeys. You can sort on 'a', but not 'a.b'.

## ON TYPES ##

We don't implement these Mongo types completely: timestamp (but date works),
symbol, javascript code (with or without scope), minkey/maxkey, regexp (stored
in the database), fixed-precision integers.

If your Javascript implementation enumerates the keys of objects in a
consistent order, then we implement object equality and object
comparison in the same way that Mongo does it (defined relative to the
key order in the objects.) If your JS implementation doesn't keep the
keys of objects in order (or you choose to consider its behavior as
undefined), then object equality and comparison is undefined in your
mongo queries.

In update, we don't support $bit (because $bit only works on the
integer type, and we don't support the integer type yet.)

## API ##

find() doesn't support retrieving a subset of fields. It always
returns the whole doc.

find() doesn't support the min and max parameters.

findAndModify isn't supported.

The aggregate functions distinct(), and group() aren't supported. Map/reduce
isn't supported.

update() should have a clear stance on atomicity (both in terms of
multiple ops on a single document, and on multi-document update mode.)
It just hasn't been looked at/thought about yet.

upsert combined with $-operators might work, but hasn't actually been
looked at or tested.

In general, the API needs tests, espectially update. (On the other
hand, the underlying selector and mutator code is quite well tested.)

## OTHER STUFF ##

We ignore the 'x' and 's' flags on regular expressions.

We don't do as much type checking as we could, especially in
selectors. If pass in something that's weirdly formed, you'll probably
just get a random exception or error.

"Natural order" isn't very well defined.

We don't support capped collections.

No performance optimization has been done. In particular, there are no
indexes.
