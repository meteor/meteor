# Meteor Template Syntax Guide

## HTML Syntax

Meteor templates are written in [standard (WHATWG) HTML](http://developers.whatwg.org/syntax.html) with some additional syntax.  It's a compile-time error if Meteor can't parse your template into a sequence of well-formed start tags, end tags, comments, character references, and so on, and match the end tags to the start tags.  All start tags normally have a corresponding end tag, except for a short list of "void" elements, including the familiar `<br>`, `<hr>`, `<img>`, and `<input>`.  Certain other end tags can optionally be omitted according to the spec (like `<p>` and `<li>`), but this feature is not currently implemented in Meteor.

In short:

* Close your HTML tags!

* Meteor will throw a compile-time error if you violate basic HTML syntax.

## Template Tag Basics

Template tags let you insert calculated text or other content in certain places in the HTML, and Meteor will automatically keep that part of the HTML up-to-date.  Template tags can only be used in the places described below; they can't be used to insert arbitrary snippets of HTML such as just an HTML start tag or just the name of a tag.

### Template Tags in Element Positions

Anywhere you could write an HTML start tag, you can use any of the five major template tag types:

```
{{doubleBrace}}

{{{tripleBrace}}}

{{> inclusion}}

{{#block}}
  <p>Hello</p>
{{/block}}

{{! This is a comment}}
```

The double-brace tag is used to insert text, while the triple-brace is used to insert HTML.  Inclusion tags insert other templates.

Block tags take a block of template code as input and are often used as control structures.  The contents of the block must contain balanced HTML tags!

A block tag can optionally take "else content" as well:

```
{{#if something}}
  <p>It's true</p>
{{else}}
  <p>It's false</p>
{{/if}}
```

Template tags may have dotted names and take positional and keyword arguments, as in `{{foo.bar this.baz x=3 label="stuff"}}`.  For more on their form and interpretation, see later sections below.

### Template Tags in Attribute Values

A double-brace tag will insert a string into a quoted or unquoted attribute value:

```
<div class="{{myClass1}} {{myClass2}}">...</div>

<a href=http://{{server}}/{{path}}>...</a>

<input type=text value={{this.name}}>
```

Using a template tag never requires additional quotes, because each template tag is parsed as a single token during HTML parsing (as if it were, say, a letter A, regardless of what it evaluates to at runtime).

Blocks are also allowed in attribute values, but their contents are parsed in a mode that disallows HTML tags, while allowing text, character references, double-brace tags, and other block tags:

```
<div class="{{#if done}}done{{else}}notdone{{/if}}">...</div>
```

XXX not implemented yet

Comment tags (`{{! This is a comment}}`) are allowed in attribute values. Triple-brace and inclusions are not allowed.

### Dynamic Attributes

As a special form, a double-brace tag can be used inside an HTML start tag to supply arbitrary reactive attributes:

```
<div {{attrs}}>...</div>

<input type=checkbox {{isChecked}}>
```

The tag must evaluate to an object that serves as a dictionary of attribute name and value strings.  (XXX not fully implemented)  For convenience, the value may also be a string or null.  Null or an empty string mean `{}`.  A non-empty string value must be an attribute name, which is expanded to an empty attribute.  For example, `"checked"` is expanded to `{checked: ""}`.  (It may seem odd that an empty string means a checkbox is checked, but this is how HTML works, it looks only at whether the attribute is present.  When you write `<input type=checkbox checked>`, modern browsers interpret this as `<input type="checkbox" checked="">`, and it means the checkbox is checked.)

To summarize:

|Return Value|Equivalent HTML|
|------------|---------------|
|`""` or `null` or `{}`| |
|`"checked"` or `{checked: ""}`|`checked`|
|`{checked: "checked"}`|`checked=checked` (some prefer this style)|
|`{checked: "", 'class': "foo"}`|`checked class=foo`|
|`"checked=checked"`|ERROR, string is not an attribute name|
|`"checked class=foo"`|ERROR, string is not an attribute name|

You can have more than one reactive attribute double-brace in the same HTML start tag, along with normal attributes.  They are combined from left to right, with later attribute values overwriting previous ones.  (Multiple attribute values for the same attribute are not merged in any way.)  Whenever any dependency of the overall calculation changes, the element's attributes are recalculated and updated.

Comment tags are allowed in the reactive attribute position, but no other template tags are.
