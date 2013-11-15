# Meteor Template Syntax Guide

## HTML Syntax

Meteor templates are written in [standard HTML](http://developers.whatwg.org/syntax.html) with some additional syntax.

Meteor validates your HTML as it goes and is not as lenient as a web browser, which will typically bend over backwards to recover from even wildly malformed markup.  Meteor will throw a compile-time error if you violate basic HTML syntax in a way that prevents Meteor from determining the structure of your code.

You must close your element tags, with a few exceptions:

* The well-known BR, HR, IMG, and INPUT tags, along with a few others, have no end tag.  You can write them in self-closing style if you like (`<br/>`) or simply write the start tag (`<br>`).

* You can omit the end tag of certain elements, like P and LI, according to the spec, but Meteor doesn't currently implement this feature.

## Template Tag Basics

Template tags let you insert text or other content in certain places in the HTML.  Meteor calculates the current value of the template tag and automatically keeps that part of the HTML up-to-date.  Template tags can only be used in the places described below.  They can't be used to insert arbitrary snippets of HTML such as just an HTML start tag or just the name of a tag.

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

The double-brace tag `{{foo}}` is used to insert text, while the triple-brace `{{{foo}}}` is used to insert HTML.  Inclusion tags like `{{> foo}}` are used to insert other templates.

The contents of a block `{{#foo}}...{{/foo}}` must contain balanced HTML tags!  Block tags take a block of template code as input and are often used as control structures.  

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

You can use double-braces, blocks, and comments inside an attribute value of an HTML start tag.  The attribute value is the part that comes after the `=` sign, and it may be surrounded in quotes or not:

```
<div class="{{myClass1}} {{myClass2}}">...</div>

<a href=http://{{server}}/{{path}}>...</a>

<input type=text value={{this.name}}>
```

Using a template tag never requires additional quotes, because each template tag is parsed as a single token during HTML parsing (as if it were, say, a letter A, regardless of what it evaluates to at runtime).

If you use a block inside an attribute value, the block contents are parsed with the same restrictions as an attribute value.  That is, you can't have HTML elements, and you can only use the template tags that are allowed in an attribute value.

```
<div class="{{#if done}}done{{else}}notdone{{/if}}">...</div>
```

XXX not implemented yet

Comment tags (`{{! This is a comment}}`) are allowed in attribute values. Triple-brace and inclusions are not allowed.

### Dynamic Attributes

As a special form, a double-brace tag can be used inside an HTML start tag to specify an arbitrary, reactively changing set of attributes:

```
<div {{attrs}}>...</div>

<input type=checkbox {{isChecked}}>
```

The tag must evaluate to an object that serves as a dictionary of attribute name and value strings.  (XXX not fully implemented)  For convenience, the value may also be a string or null.

Null or an empty string expands to `{}`.  A non-empty string value must be an attribute name, which is expanded to an empty attribute.  For example, `"checked"` is expanded to `{checked: ""}` (which, as far as HTML is concerned, means the checkbox is checked; the value of the attribute is ignored as long as it is present).

To summarize:

|Return Value|Equivalent HTML|
|------------|---------------|
|`""` or `null` or `{}`| |
|`"checked"` or `{checked: ""}`|`checked`|
|`{checked: "", 'class': "foo"}`|`checked class=foo`|
|`"checked class=foo"`|ERROR, string is not an attribute name|

You can combine multiple dynamic attributes tags with other attributes:

```
<div id=foo class={{myClass}} {{attrs1}} {{attrs2}}>...</div>
```

Attributes are combined from left to right, with later attribute values overwriting previous ones.  Multiple values for the same attribute are not merged in any way, so if `attrs1` specifies a value for the `class` attribute, it will overwrite `{{myClass}}`.  Meteor takes care of recalculating the element's attributes if any of `myClass`, `attrs1`, or `attrs2` changes reactively.

Comment tags are allowed in the reactive attribute position.
