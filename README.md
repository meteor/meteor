
# Spacebars

Spacebars is a Meteor template language inspired by [Handlebars](http://handlebarsjs.com/).  It shares much of the spirit and syntax of Handlebars, but it's tailored to produce specifications of reactive Meteor UI components when compiled.

## Syntax

A Spacebars template consists of HTML interspersed with "stache tags" (so-called because a curly brace `{` looks a bit like a mustache).  A stache tag starts with `{{` or `{{{` and ends with the same number of curly braces.  Any amount of whitespace is allowed inside the curly braces at the beginning or end of a stache tag, and if there is initial puncutation such as `>` or `#` in `{{>foo}}` or `{{#foo}}`, any amount of whitespace is allowed on either side of the punctuation.

### Types of Tags

#### Double-stache

A basic double-stache tag consists of an identifier or a dotted path (see Paths below) and evaluates to some text:

```
<h1>{{title}}</h1>

<p class="content {{para.class}}">
  {{para.text}}
</p>
```

Double-stache tags may only be used at the level of HTML elements (that is, outside HTML tag angle brackets) or in an attribute of an HTML tag.  The inserted text is automatically HTML-escaped as appropriate (for example, turning `<` into `&lt;`).  Double-stache tags may not be used to generate the name of a tag (as in `<{{foo}}>`) or any other piece of a tag except for attribute names and values as described here.

Any part of an attribute name or value is fair game:

````
<div data-{{foo}}={{bar}}>
  <input type="checkbox" {{isChecked}}>
</div>
```

If you want to insert multiple `name=value` pairs or a reactively changing set of attributes, use a triple-stache tag as described below.

If two attributes with the same name are specified using any combination of mechanisms, the resulting behavior is undefined.

Like most tag types, double-stache tags can take any combination of positional and keyword arguments, which themselves may contain dotted paths and literal values, as in: `{{foo bar.baz x=3 y=n type="awesome"}}`.  See Tag Arguments.

#### Triple-stache

Triple-stache tags are used to insert raw HTML into a template:

```
<div class="snippet">
  {{{snippetBody}}}
</div>
```

The inserted HTML must consist of balanced HTML tags, or else balanced tags with some end tags omitted per the rules of HTML parsing.  You can't, for example, insert `"</div><div>"` to close an existing div and open a new one.  In this form, the tag must occur at HTML element level (not inside any angle brackets).

A second form of the triple-stache is used inside HTML tags to insert zero or more dynamically generated attributes:

```
<input type="text" {{{myAttrs}}} class="foo">
```

In this form, the stache tag must occur by itself as shown and not as part of a `name=value` pair.  The value of `myAttrs` may either be a string that parses as zero or more attributes, such as `""` or `"foo=bar id='myInput'"`, or an object whose property values are strings that serves as a name/value dictionary.  If two attributes with the same name are specified using any combination of mechanisms, the resulting behavior is undefined.

#### Blocks and Inclusions

An inclusion tag inserts a Meteor UI component at the current element-level location in the HTML:

```
<div>
  {{> thumbnail currentPhoto}}
</div>
```

A block tag also inserts a Meteor UI component, but it provides a block of content as a sort of extra argument, and an optional second block of content if the special tag `{{else}}` is used.  The control structures `if` and `each` are implemented as components:

```
{{#each items}}
  <div class="item">
    {{#if editing}}
      {{> editor}}
    {{else}}
      {{> itemView}}
    {{/if}}
  </div>
{{/each}}
```

Blocks have an open stache tag `{{#foo}}` and a corresponding close stache tag `{{/foo}}`.  The template code in the block may be invoked any number of times or not at all by the component.

Inclusion tags and open block tags take any number of keyword arguments and one, optional positional argument that is equivalent to the `data` keyword argument (so we could have written `{{#each data=items}}` in the above example).
    
#### Comment

A comment begins with `{{!` and can contain any characters except for `}}`.  Comments are removed upon compilation and never appear in the compiled template code or the generated HTML.

```
{{! TODO: use fancy HTML5 tags}}
<div class="section">
  ...
</div>
```

### Paths

A "dotted path" is generally a series of one or more JavaScript identifier names separated by a dot and is used as the name of a stache tag or the value of a tag argument:

```
{{> users.UserIcon contacts.current type=IconTypes.SMALL}}
```

The use of `/` as a separator instead of `.` is also allowed, as in `foo/bar`.

An "anchored path" is one that has the identifier `this` or the special path elements `.` or `..` in the first position, as in `this.foo` or `./foo`, which are equivalent.  `..` is a special path element that can appear multiple times but not after any non-`..` elements.  After `this`, `.`, or a series of `..`, `this` is considered a normal identifier with no special meaning and `.` or '..` are disallowed.

A path element may also be written in square brackets, in which case it may contain any character except for `]`.  Such an element may even be empty, written as `[]`, but the first element of a path may not be empty.  Brackets are required to use one of the following as the first element of a path: `else`, `this`, `true`, `false`, and `null`.  Brackets are not required around JavaScript keywords and reserved words like `var` and `for`.

Representationally, a path is just an array of one or more strings, where the first string may not be empty but may be a special element corresponding to `this`.

### Tag Arguments

Double-stache, triple-stache, inclusion, and (open) block tags all take positional and keyword arguments:

```
{{foo bar.baz x=3 y=n type="awesome"}}
```

A keyword argument looks like a positional argument prefixed with a JavaScript identifier name and an `=` character, with optional whitespace around the `=`.

A positional argument takes one of the following forms:

* A path, as described in the section "Paths"

* A single- or double-quoted JavaScript string literal.  The string may span multiple lines if newlines are escaped, per the ECMAScript spec 5th edition.

* A JavaScript number literal, which may have an exponent (`1e3`) or be in hex (`0xa`).

* The string `true`, `false`, or `null`.

## Semantics

XXX
