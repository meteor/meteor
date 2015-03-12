# Spacebars

Spacebars is a Meteor template language inspired by
[Handlebars](http://handlebarsjs.com/).  It shares some of the spirit and syntax
of Handlebars, but it has been tailored to produce reactive Meteor templates
when compiled.

## Getting Started

A Spacebars template consists of HTML interspersed with template tags, which are
delimited by `{{` and `}}` (two curly braces).

```handlebars
<template name="myPage">
  <h1>{{pageTitle}}</h1>

  {{> nav}}

  {{#each posts}}
    <div class="post">
      <h3>{{title}}</h3>
      <div class="post-content">
        {{{content}}}
      </div>
    </div>
  {{/each}}
</template>
```

As illustrated by the above example, there are four major types of template
tags:

* `{{pageTitle}}` - Double-braced template tags are used to insert a string of
  text.  The text is automatically made safe.  It may contain any characters
  (like `<`) and will never produce HTML tags.

* `{{> nav}}` - Inclusion template tags are used to insert another template by
  name.

* `{{#each}}` - Block template tags are notable for having a block of content.
  The block tags `#if`, `#each`, `#with`, and `#unless` are built in, and it is
  also possible define custom ones.  Some block tags, like `#each` and `#with`,
  establish a new data context for evaluating their contents.  In the above
  example, `{{title}}` and `{{content}}` most likely refer to properties of the
  current post (though they could also refer to template helpers).

* `{{{content}}}` - Triple-braced template tags are used to insert raw HTML.  Be
  careful with these!  It's your job to make sure the HTML is safe, either by
  generating it yourself or sanitizing it if it came from a user input.

## Reactivity Model

Spacebars templates update reactively at a fine-grained level in response to
changing data.

Each template tag's DOM is updated automatically when it evaluates to a new
value, while avoiding unnecessary re-rendering as much as possible.  For
example, a double-braced tag replace its text node when its text value changes.
An `#if` re-renders its contents only when the condition changes from truthy to
falsy or vice versa.

## Identifiers and Paths

A Spacebars identifier is either a JavaScript identifier name or any string
enclosed in square brackets (`[` and `]`).  There are also the special
identifiers `this` (or equivalently, `.`) and `..`.  Brackets are required to
use one of the following as the first element of a path: `else`, `this`, `true`,
`false`, and `null`.  Brackets are not required around JavaScript keywords and
reserved words like `var` and `for`.

A Spacebars path is a series of one or more identifiers separated by either `.`
or `/`, such as `foo`, `foo.bar`, `this.name`, `../title`, or `foo.[0]` (numeric indices must be enclosed in brackets).

### Name Resolution

The first identifier in a path is resolved in one of two ways:

* Indexing the current data context.  The identifier `foo` refers to the `foo`
  property of the current data context object.

* As a template helper.  The identifier `foo` refers to a helper function (or
  constant value) that is accessible from the current template.

Template helpers take priority over properties of the data context.

If a path starts with `..`, then the *enclosing* data context is used instead of
the current one.  The enclosing data context might be the one outside the
current `#each`, `#with`, or template inclusion.

### Path Evaluation

When evaluating a path, identifiers after the first are used to index into the
object so far, like JavaScript's `.`.  However, an error is never thrown when
trying to index into a non-object or an undefined value.

In addition, Spacebars will call functions for you, so `{{foo.bar}}` may be
taken to mean `foo().bar`, `foo.bar()`, or `foo().bar()` as appropriate.

## Helper Arguments

An argument to a helper can be any path or identifier, or a string, boolean, or
number literal, or null.

Double-braced and triple-braced template tags take any number of positional and
keyword arguments:

```handlebars
{{frob a b c verily=true}}
```
calls:
```javascript
frob(a, b, c, Spacebars.kw({verily: true}))
```

`Spacebars.kw` constructs an object that is `instanceof Spacebars.kw` and whose
`.hash` property is equal to its argument.

The helper's implementation can access the current data context as `this`.

## Inclusion and Block Arguments

Inclusion tags (`{{> foo}}`) and block tags (`{{#foo}}`) take a single
data argument, or no argument.  Any other form of arguments will be interpreted
as an *object specification* or a *nested helper*:

* **Object specification**: If there are only keyword arguments, as in `{{#with
  x=1 y=2}}` or `{{> prettyBox color=red}}`, the keyword arguments will be
  assembled into a data object with properties named after the keywords.

* **Nested Helper**: If there is a positional argument followed by other
  (positional or keyword arguments), the first argument is called on the others
  using the normal helper argument calling convention.

## Template Tag Placement Limitations

Unlike purely string-based template systems, Spacebars is HTML-aware and
designed to update the DOM automatically.  As a result, you can't use a template
tag to insert strings of HTML that don't stand on their own, such as a lone HTML
start tag or end tag, or that can't be easily modified, such as the name of an
HTML element.

There are three main locations in the HTML where template tags are allowed:

* At element level (i.e. anywhere an HTML tag could go)
* In an attribute value
* In a start tag in place of an attribute name/value pair

The behavior of a template tag is affected by where it is located in the HTML,
and not all tags are allowed at all locations.

## Double-braced Tags

A double-braced tag at element level or in an attribute value typically evalutes
to a string.  If it evalutes to something else, the value will be cast to a
string, unless the value is `null`, `undefined`, or `false`, which results in
nothing being displayed.

Values returned from helpers must be pure text, not HTML.  (That is, strings
should have `<`, not `&lt;`.)  Spacebars will perform any necessary escaping if
a template is rendered to HTML.

### SafeString

If a double-braced tag at element level evalutes to an object created with
`Spacebars.SafeString("<span>Some HTML</span>")`, the HTML is inserted at the
current location.  The code that calls `SafeString` is asserting that this HTML
is safe to insert.

### In Attribute Values

A double-braced tag may be part of, or all of, an HTML attribute value:

```handlebars
<input type="checkbox" class="checky {{moreClasses}}" checked={{isChecked}}>
```

An attribute value that consists entirely of template tags that return `null`,
`undefined`, or `false` is considered absent; otherwise, the attribute is
considered present, even if its value is empty.

### Dynamic Attributes

A double-braced tag can be used in an HTML start tag to specify an arbitrary set
of attributes:

```handlebars
<div {{attrs}}>...</div>

<input type=checkbox {{isChecked}}>
```

The tag must evaluate to an object that serves as a dictionary of attribute name
and value strings.  For convenience, the value may also be a string or null.  An
empty string or null expands to `{}`.  A non-empty string must be an attribute
name, and expands to an attribute with an empty value; for example, `"checked"`
expands to `{checked: ""}` (which, as far as HTML is concerned, means the
checkbox is checked).

To summarize:

|Return Value|Equivalent HTML|
|------------|---------------|
|`""` or `null` or `{}`| |
|`"checked"` or `{checked: ""}`|`checked`|
|`{checked: "", 'class': "foo"}`|`checked class=foo`|
|`"checked class=foo"`|ERROR, string is not an attribute name|

You can combine multiple dynamic attributes tags with other attributes:

```handlebars
<div id=foo class={{myClass}} {{attrs1}} {{attrs2}}>...</div>
```

Attributes from dynamic attribute tags are combined from left to right, after
normal attributes, with later attribute values overwriting previous ones.
Multiple values for the same attribute are not merged in any way, so if `attrs1`
specifies a value for the `class` attribute, it will overwrite `{{myClass}}`.
As always, Spacebars takes care of recalculating the element's attributes if any
of `myClass`, `attrs1`, or `attrs2` changes reactively.


## Triple-braced Tags

Triple-braced tags are used to insert raw HTML into a template:

```handlebars
<div class="snippet">
  {{{snippetBody}}}
</div>
```

The inserted HTML must consist of balanced HTML tags.  You can't, for example,
insert `"</div><div>"` to close an existing div and open a new one.

This template tag cannot be used in attributes or in an HTML start tag.

## Inclusion Tags

An inclusion tag takes the form `{{> templateName}}` or `{{> templateName
dataObj}}`.  Other argument forms are syntactic sugar for constructing a data
object (see Inclusion and Block Arguments).

An inclusion tag inserts an instantiation of the given template at the current
location.  If there is an argument, it becomes the data context, much as if the
following code were used:

```handlebars
{{#with dataObj}}
  {{> templateName}}
{{/with}}
```

Instead of simply naming a template, an inclusion tag can also specify a path
that evalutes to a template object, or to a function that returns a template
object.

### Function Returning a Template

If an inclusion tag resolves to a function, the function must return a template
object or `null`.  The function is reactively re-run, and if its return value
changes, the template will be replaced.

## Block Tags

Block tags invoke built-in directives or custom block helpers, passing a block
of template content that may be instantiated once, more than once, or not at all
by the directive or helper.

```handlebars
{{#block}}
  <p>Hello</p>
{{/block}}
```

Block tags may also specify "else" content, separated from the main content by
the special template tag `{{else}}`.

A block tag's content must consist of HTML with balanced tags.

Block tags can be used inside attribute values:

```handlebars
<div class="{{#if done}}done{{else}}notdone{{/if}}">
  ...
</div>
```

## If/Unless

An `#if` template tag renders either its main content or its "else" content,
depending on the value of its data argument.  Any falsy JavaScript value
(including `null`, `undefined`, `0`, `""`, and `false`) is considered false, as
well as the empty array, while any other value is considered true.

```handlebars
{{#if something}}
  <p>It's true</p>
{{else}}
  <p>It's false</p>
{{/if}}
```

`#unless` is just `#if` with the condition inverted.

## With

A `#with` template tag establishes a new data context object for its contents.
The properties of the data context object are where Spacebars looks when
resolving template tag names.

```handlebars
{{#with employee}}
  <div>Name: {{name}}</div>
  <div>Age: {{age}}</div>
{{/with}}
```

We can take advantage of the object specification form of a block tag to define
an object with properties we name:

```handlebars
{{#with x=1 y=2}}
  {{{getHTMLForPoint this}}}
{{/with}}
```

If the argument to `#with` is falsy (by the same rules as for `#if`), the
content is not rendered.  An "else" block may be provided, which will be
rendered instead.

If the argument to `#with` is a string or other non-object value, it may be
promoted to a JavaScript wrapper object (also known as a boxed value) when
passed to helpers, because JavaScript traditionally only allows an object for
`this`.  Use `String(this)` to get an unboxed string value or `Number(this)` to
get an unboxed number value.

## Each

An `#each` template tag takes a sequence argument and inserts its content for
each item in the sequence, setting the data context to the value of that item:

```handlebars
<ul>
{{#each people}}
  <li>{{name}}</li>
{{/each}}
</ul>
```

The argument is typically a Meteor cursor (the result of `collection.find()`,
for example), but it may also be a plain JavaScript array, `null`, or
`undefined`.

An "else" section may be provided, which is used (with no new data
context) if there are zero items in the sequence at any time.

### Reactivity Model for Each

When the argument to `#each` changes, the DOM is always updated to reflect the
new sequence, but it's sometimes significant exactly how that is achieved.  When
the argument is a Meteor live cursor, the `#each` has access to fine-grained
updates to the sequence -- add, remove, move, and change callbacks -- and the
items are all documents identified by unique ids.  As long as the cursor itself
remains constant (i.e. the query doesn't change), it is very easy to reason
about how the DOM will be updated as the contents of the cursor change.  The
rendered content for each document persists as long as the document is in the
cursor, and when documents are re-ordered, the DOM is re-ordered.

Things are more complicated if the argument to the `#each` reactively changes
between different cursor objects, or between arrays of plain JavaScript objects
that may not be identified clearly.  The implementation of `#each` tries to be
intelligent without doing too much expensive work. Specifically, it tries to
identify items between the old and new array or cursor with the following
strategy:

1. For objects with an `_id` field, use that field as the identification key
2. For objects with no `_id` field, use the array index as the identification
   key. In this case, appends are fast but prepends are slower.
3. For numbers or strings, use their value as the identification key.

In case of duplicate identification keys, all duplicates after the first are
replaced with random ones. Using objects with unique `_id` fields is the way to
get full control over the identity of rendered elements.

## Custom Block Helpers

To define your own block helper, simply declare a template, and then invoke it
using `{{#someTemplate}}` (block) instead of `{{> someTemplate}}` (inclusion)
syntax.

When a template is invoked as a block helper, it can use `{{>
Template.contentBlock}}` and `{{> Template.elseBlock}}` to include the block
content it was passed.

Here is a simple block helper that wraps its content in a div:

```handlebars
<template name="note">
  <div class="note">
    {{> Template.contentBlock}}
  </div>
</template>
```

You would invoke it as:

```handlebars
{{#note}}
  Any content here
{{/note}}
```

Here is an example of implementing `#unless` in terms of `#if` (ignoring for the
moment that `unless` is a built-in directive):

```handlebars
<template name="unless">
  {{#if this}}
    {{> Template.elseBlock}}
  {{else}}
    {{> Template.contentBlock}}
  {{/if}}
</template>
```

Note that the argument to `#unless` (the condition) becomes the data context in
the `unless` template and is accessed via `this`.  However, it would not work
very well if this data context was visible to `Template.contentBlock`, which is
supplied by the user of `unless`.

Therefore, when you include `{{> Template.contentBlock}}`, Spacebars hides the
data context of the calling template, and any data contexts established in the
template by `#each` and `#with`.  They are not visible to the content block,
even via `..`.  Put another way, it's as if the `{{> Template.contentBlock}}`
inclusion occurred at the location where `{{#unless}}` was invoked, as far as
the data context stack is concerned.

You can pass an argument to `{{> Template.contentBlock}}` or `{{>
Template.elseBlock}}` to invoke it with a data context of your choice.  You can
also use `{{#if Template.contentBlock}}` to see if the current template was
invoked as a block helper rather than an inclusion.

## Comment Tags

Comment template tags begin with `{{!` and can contain any characters except for
`}}`.  Comments are removed upon compilation and never appear in the compiled
template code or the generated HTML.

```handlebars
{{! Start of a section}}
<div class="section">
  ...
</div>
```

Comment tags also come in a "block comment" form.  Block comments may contain
`{{` and `}}`:

```handlebars
{{!-- This is a block comment.
We can write {{foo}} and it doesn't matter.
{{#with x}}This code is commented out.{{/with}}
--}}
```

Comment tags can be used wherever other template tags are allowed.

## HTML Dialect

Spacebars templates are written in [standard
HTML](http://developers.whatwg.org/syntax.html) extended with
additional syntax (i.e. template tags).

Spacebars validates your HTML as it goes and will throw a compile-time
error if you violate basic HTML syntax in a way that prevents it from
determining the structure of your code.

Spacebars is not lenient about malformed markup the way a web browser
is.  While the latest HTML spec standardizes how browsers should
recover from parse errors, these cases are still not valid HTML.  For
example, a browser may recover from a bare `<` that does not begin a
well-formed HTML tag, while Spacebars will not.  However, gone are the
restrictions of the XHTML days; attribute values do not have to
quoted, and tags are not case-sensitive, for example.

You must close all HTML tags except the ones specified to have no end
tag, like BR, HR, IMG and INPUT.  You can write these tags as `<br>`
or equivalently `<br/>`.

The HTML spec allows omitting some additional end tags, such as P and
LI, but Spacebars doesn't currently support this.

## Top-level Elements in a `.html` file

Technically speaking, the `<template>` element is not part of the Spacebars
language. A `foo.html` template file in Meteor consists of one or more of the
following elements:

* `<template name="myName">` - The `<template>` element contains a Spacebars
  template (as defined in the rest of this file) which will be compiled to the
  `Template.myName` component.

* `<head>` - Static HTML that will be inserted into the `<head>` element of the
  default HTML boilerplate page. Cannot contain template tags. If `<head>` is
  used multiple times (perhaps in different files), the contents of all of the
  `<head>` elements are concatenated.

* `<body>` - A template that will be inserted into the `<body>` of the main
  page.  It will be compiled to the `Template.body` component. If `<body>` is
  used multiple times (perhaps in different files), the contents of all of the
  `<body>` elements are concatenated.
