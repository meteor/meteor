# HTMLjs

A small (500-line) library for expressing HTML trees in a concise syntax.

```
var UL = HTML.UL, LI = HTML.LI, B = HTML.B;

HTML.toHTML(
  UL({id: 'mylist'},
     LI({'class': 'item'}, "Hello ", B("world"), "!"),
     LI({'class': 'item'}, "Goodbye, world")))
```

```
<ul id="mylist">
  <li class="item">Hello <b>world</b>!</li>
  <li class="item">Goodbye, world</li>
</ul>
```

Tag constructors (like `UL`) return an object representation which can
be used to generate HTML, or, via other packages, be used to generate
DOM (`ui`), be parsed from HTML (`html-tools`), or serve as the
backbone of the intermediate representation for a template compiler
(`spacebars-compiler`).

## Syntax

Tag constructors take an optional first argument `attrs` followed by
zero or more arguments, the `children`.  The first argument is taken
to be `attrs` if it is a "vanilla" JavaScript object such as an object
literal.

> Ideally, a "vanilla" object would be one whose direct prototype is
> `Object.prototype`.  Since this test is impossible in IE 8, we test
> `obj.constructor === Object`, which is true for object literals
> (except ones like `{constructor: blah}`!) and false for most objects
> with custom prototypes (because JavaScript sets
> `MyClass.prototype.constructor = MyClass` when you create a function
> `MyClass`).

Children of a tag may be of any of several built-in types:

* Tag (HTML.Tag)
* HTML.CharRef
* HTML.Comment
* HTML.Raw
* String
* Boolean or Number (which will be converted to String)
* Array (which will be flattened)
* Null or undefined (which will be ignored)
* Template/Component
* Function returning one of these types

The set of allowed types is *open* in that any object may be included
in the tree as long as the code consuming the tree can handle it.

Character references (like `&amp;`) are *not* interpreted in strings.
To include a character reference, use `HTML.CharRef({html:
'&amp;', str: '&'})`, specifying both the raw HTML form and the string
form of the character.

> In other words, string values are of the form you would pass to
`document.createTextNode`, not of the form you would see in an HTML
document.  The intent here is to only need to parse and interpret
character references at compile time, making the representation
maximally flexible easy to consume at runtime.
>
> The reason we represent character references at all, rather than
> simply converting them to Unicode when parsing the source HTML
> (and then escaping `&` and `<` at the very end)
> is 1) to preserve the HTML author's intent, and 2) in case there
> is a character-encoding-related reason that a character reference
> is being used.

Attribute values can contain character references, using arrays to
hold the string and CharRef parts:

```
var amp = HTML.CharRef({html: '&amp;', str: '&'});

HTML.toHTML(HTML.SPAN({title: ['M', amp, 'Ms']},
                      'M', amp, 'M candies'))
```

```
<span title="M&amp;Ms">M&amp;M candies</span>
```

A comment looks like `HTML.Comment("value here")`, where the value
should not contain two consecutive hyphen (`-`) characters or an
initial or final hyphen (or they will be stripped out).

A "raw" object like `HTML.Raw("<br>")` represents raw HTML to insert
into the document.  The HTML should be known to be safe and contain
balanced tags!  It will be injected without any parsing or checking
when the representation is converted to an HTML string.  If the
representation is used to generate DOM directly, the "raw" node will
be materialized using an innerHTML-like method.

Functions in the tree are used as reactivity boundaries when
generating DOM directly.  When generating HTML, they are simply called
for their return value.  Functions are passed no arguments and are
given no particular value of `this`.

Templates/components like `Template.foo` can also be included in the
representation.  HTMLjs has very limited knowledge of what a component
is.  It knows components have an `instantiate` method that returns
something with a `render` method.  Operations that realize an HTMLjs
tree as HTML, DOM, or some other form have a bit of boilerplate that
they use to detect and instantiate components:

```
HTML.toHTML = function (node, parentComponent) {
  // ... handle various types of `node`
  if (typeof node.instantiate === 'function') {
    // component
    var instance = node.instantiate(parentComponent || null);
    var content = instance.render();
    // recurse with a new value for parentComponent
    return HTML.toHTML(content, instance);
  }
  // ...
};
```

## "Known" and Custom Tags

All the usual HTML and HTML5 tags are available as `HTML.A`,
`HTML.ABBR`, `HTML.ADDRESS`, etc.  These tags are called "known" tags
and have predefined tag constructors.  If you want to use a custom
tag, you'll have to create the tag constructor using `getTag` or `ensureTag`.

```
var SPAN = HTML.SPAN;
var FOO = HTML.getTag('FOO');
```

```
HTML.ensureTag('FOO');
var SPAN = HTML.SPAN;
var FOO = HTML.FOO;
```

All of these functions handle case conversion of `tagName` as
appropriate, so whether you provide `foo` or `Foo` or `FOO`, the
symbol on `HTML` will be `HTML.FOO`, while generated HTML and DOM will use
the lowercase name `foo`.

`HTML.getTag(tagName)` - Returns a tag constructor for `tagName`, calling `ensureTag` if it doesn't exist.

`HTML.ensureTag(tagName)` - Creates a tag constructor for `tagName` if one doesn't exist and attaches it to the `HTML` object.

`HTML.isTagEnsured(tagName)` - Returns true if `tagName` has a built-in, predefined constructor.  Useful for code generators that want to know if they should emit a call to `ensureTag`.

## Object Representation

Tag constructors follow an object-oriented paradigm with optional
`new`.  The returned objects are `instanceof` the tag constructor and
also of `HTML.Tag`.  In other words, all of the following are true:

```
HTML.P() instanceof HTML.P
HTML.P() instanceof HTML.Tag
(new HTML.P) instanceof HTML.P
(new HTML.P) instanceof HTML.Tag
```

Similarly, objects constructed with `HTML.Comment` are instances of `HTML.Comment`, and so on.

In general, HTMLjs objects should be considered immutable.

HTML.Tag objects have these properties:

* `tagName` - the uppercase tag name
* `attrs` - an object or null
* `children` - an array of zero or more children

HTML.CharRef objects have `html` and `str` properties, specified by
the object passed to the constructor.

HTML.Comment and HTML.Raw objects have a `value` property.

## Name Utilities

All of these functions take case-insensitive input.

`HTML.properCaseTagName(tagName)` - Case-convert a tag name for inclusion in HTML or passing to `document.createElement`.  Most tags belong in lowercase, but there are some camel-case SVG tags.  HTML processors must know the proper case for tag names, because HTML is case-insensitive but the DOM is sometimes case-sensitive.

`HTML.properCaseAttributeName(name)` - Case-convert an attribute name for inclusion in HTML or passing to `element.setAttribute`.  See `HTML.properCaseTagName`.

`HTML.isValidAttributeName(name)` - Returns true if `name` conforms to a restricted set of legal characters known to work both in HTML and the DOM APIs.  Allows at least ASCII numbers and letters, hyphens, and underscores, where the first character can't be a number or a hyphen.

`HTML.isKnownElement(tagName)` - Returns true if `tagName` is a known HTML/HTML5 element, excluding SVG and other foreign elements.

`HTML.isKnownSVGElement(tagName)` - Returns true if `tagName` is a known SVG element.

`HTML.isVoidElement(tagName)` - Returns true if `tagName` is a known void element such as `BR`, `HR`, or `INPUT`.  Void elements are output as `<br>` instead of `<br></br>`.  Note that neither HTML4 nor HTML5 has true self-closing tags (except when parsing SVG).  `<br/>` is the same as `<br>` and `<div/>` is the same as `<div>`.  It was only the now-abandoned XHTML standard that said otherwise, which was a backwards-incompatible change.  Modern browsers refer to the list of void elements instead.

`HTML.asciiLowerCase(str)` - "ASCII-lowercases" `str`, converting `A-Z` to `a-z`.  The case-insensitive parts of HTML use this operation for case folding.

