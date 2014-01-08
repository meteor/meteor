# html-tools

A lightweight HTML tokenizer and parser which outputs to the HTMLjs
object representation.  Special hooks allow the syntax to be extended
to parse an HTML-like template language like Spacebars.

```
HTML.parseFragment("<div class=greeting>Hello<br>World</div>")

=> HTML.DIV({'class':'greeting'}, "Hello", HTML.BR(), "World"))
```

This package is used by the Spacebars compiler, which normally only
runs at bundle time but can also be used at runtime on the client or
server.

## Invoking the Parser

`HTML.parseFragment(input, options)` - Takes an input string or Scanner object and returns HTMLjs.

In the basic case, where no options are passed, `parseFragment` will consume the entire input (the full string or the rest of the Scanner).

The options are as follows:

#### getSpecialTag

This option extends the HTML parser to parse template tags such as `{{foo}}`.

`getSpecialTag: function (scanner, templateTagPosition) { ... }` - A function for the parser to call after every HTML token and at various positions within tags.  If the function returns a non-null value, that value is wrapped in an `HTML.Special` node which is inserted into the HTMLjs tree at the appropriate location.  The function is expected to advance the scanner if it succeeds at parsing a template tag (see the section on `HTML.Scanner`).

There are four possible outcomes when `getSpecialTag` is called:

* Not a template tag - Leave the scanner as is, and return `null`.  A quick peek at the next character should bail to this case if the start of a template tag is not seen.
* Bad template tag - Call `scanner.fatal`, which aborts parsing completely.  Once the beginning of a template tag is seen, `getSpecialTag` will generally want to commit, and either succeed or fail trying).
* Good template tag - Advance the scanner to the end of the template tag and return an object.
* Comment tag - Advance the scanner and return `null`.  For example, a Spacebars comment is `{{! foo}}`.

The `templateTagPosition` argument to `getSpecialTag` is one of:

* `HTML.TEMPLATE_TAG_POSITION.ELEMENT` - At "element level," meaning somewhere an HTML tag could be.
* `HTML.TEMPLATE_TAG_POSITION.IN_START_TAG` - Inside a start tag, as in `<div {{foo}}>`, where you might otherwise find `name=value`.
* `HTML.TEMPLATE_TAG_POSITION.IN_ATTRIBUTE` - Inside the value of an HTML attribute, as in `<div class={{foo}}>`.
* `HTML.TEMPLATE_TAG_POSITION.IN_RCDATA` - Inside a TEXTAREA or a block helper inside an attribute, where character references are allowed ("replaced character data") but not tags.
* `HTML.TEMPLATE_TAG_POSITION.IN_RAWTEXT` - In a context where character references are not parsed, such as a script tag, style tag, or markdown helper.

It's completely normal for `getSpecialTag` to invoke `HTML.parseFragment` recursively on the same scanner (see `shouldStop`).  If it does so, the same value of `getSpecialTag` must be passed to the second invocation.

At the moment, template tags must begin with `{`.  The parser does not try calling `getSpecialTag` for every character of an HTML document, only at token boundaries, and it knows to always end a token at `{`.

**XXX Better error message for `<div {{k}}={{v}}>`.**

**XXX Do something with `<input type=checkbox {{#if foo}}checked{{/if}}>`**

**XXX Why both IN_ATTRIBUTE and IN_RCDATA?**

**XXX Fix Markdown**

#### textMode

The `textMode` option, if present, causes the parser to parse text (such as the contents of a `<textarea>` tag or part of an attribute) instead of HTML.  In a text mode, for example, the input `"<"` is not a parse error (because a bare `<` is allowed in a textarea or attribute).

The value of `textMode` must be one of:

* `HTML.TEXTMODE.RCDATA` - Interpret character references (the usual case)
* `HTML.TEXTMODE.STRING` - Don't interpret character references (the RAWTEXT case)

#### shouldStop

`shouldStop: function (scanner) { ... }` - A function that the parser invokes between tokens to check whether it should stop parsing.  The function should return a boolean value.

The `shouldStop` function provides a way to put a "wall" in the input stream for the purpose of parsing HTML content embedded in a template tag.  For example, take the template `{{#if happy}}yay{{/if}}`.  The scanner will be advanced to the start of the word `yay` before `parseFragment` is called to parse the contents of the tag.  (Note that the caller happens to be the `getSpecialTag` function of an enclosing `parseFragment`.)  When parsing from `yay`, the `shouldStop` function is used to end the fragment at `{{/if}}`, which, like `{{/blah}}` or `{{else}}`, couldn't possibly be actual content that belongs in the fragment.  Even if HTML tags are not closed, as in the malformed template `{{#if foo}}<div>{{else}}`, the fragment stops at the `{{else}}`, and the error is an unclosed `<div>` (before the parser notices the unclosed `{{#if}}`).

**XXX This option doesn't seem very elegant, or at least the way it's passed around internally isn't.**

## HTML.Scanner class

To write `getSpecialTag` and `shouldStop` functions, you have to
interface with the `HTML.Scanner` class used by html-tools.  It's a
general class that could be used by any parser/lexer/tokenizer.

A Scanner has an immutable source document and a mutable pointer into
the document.

* `new Scanner(input)` - constructs a Scanner with source string `input`
* `scanner.input` (read-only) - the entire source string
* `scanner.pos` (read/write) - the current index into the source string

Scanners provide these methods for convenience:

* `scanner.rest()` - `input.slice(pos)` (the rest of the document)
* `scanner.peek()` - `input.charAt(pos)` (the next character)
* `scanner.isEOF()` - true if `pos` is at or beyond the end of `input`
* `scanner.fatal(msg)` - throw an error indicating a problem at `pos`

Even though `scanner.rest()` performs a substring operation, it should be considered fast and O(1), because all known JavaScript runtimes in use have constant-time substring.  It would be possible, but extremely clumsy, to avoid such a substring operation while performing the usual business of a parser, which is to try to match a regex anchored at a particular index.

Functions that take scanners generally have three possible outcomes:

* Success:  Advance `scanner.pos` and return some truthy value
* Failure: Leave `scanner.pos` alone and return `null`
* Fatal: Throw an exception via `scanner.fatal`

It's particularly important that in the Failure case, the function restores the scanner to the state it found it.  This makes it possible to immediately try another parse function when one fails and form alternations such as `foo(scanner) || bar(scanner)`.

It's often easiest to avoid the Failure case altogether, writing parse functions that always succeed or throw.  This requires less bookkeeping and leads to good error messages.  A Failure case may be added if it is simple to check for up front and makes the function easier to use in an alternation.  We say a function has "committed" or "will succeed or fail fatally trying" when it has reached a point where it must return a value or throw.  Any parse function that has moved the scanner position and not remembered the original position is necessarily committed.  Usually, committing is completely natural in the context of the language being parsed; for example, `{{` in a template always starts a template tag or throws an error about a malformed template tag.

## HTML Dialect

HTML has many dialects and potential degrees of permissiveness.  We
use the WHATWG syntax spec and are pretty strict, failing on any
"parse error" cases, which basically means the input has to be
valid "HTML5" (except for the template tags).

HTML syntax references:

* [Human-readable syntax guide](http://developers.whatwg.org/syntax.html#syntax)
* [Tokenization state machine](http://www.whatwg.org/specs/web-apps/current-work/multipage/tokenization.html)

The WHATWG parser without error recovery is strict compared to
browsers (which will recover from almost anything), but lenient
compared to the now-defunct XHTML spec (which required lowercase tag
names and lots more escaping of special characters).

The following are examples of **errors**:

* A stray or unclosed `<` character
* An unknown character reference like `&asdf;`
* Self-closing tags like `<div/>` (except for BR, HR, INPUT, and other "void" elements)
* End tags for void elements (BR, HR, INPUT, etc.)
* Missing end tags, in most cases (e.g. missing `</div>`)

The following are **permitted**:

* Bare `>` characters
* Bare `&` that can't be confused with a character reference
* Uppercase or lowercase tag and attribute names (case insensitive)
* Unquoted and valueless attributes - `<input type=checkbox checked>`
* Most characters in attribute values - `<img alt=x,y>`
* Embedded SVG elements

**XXX Currently you have to close your Ps, LIs, and other tags for which the spec allows the end tag to be omitted in many cases**

## Character References

This package contains a lookup table for all known named character references in HTML, of which there are over 2,000, from `&Aacute;` (capital A, acute accent) to `&zwnj;` (zero-width non-joiner), as well as code for interpreting numeric character entities like `&#65;`.

Since character references are parsed into `HTML.CharRef` objects which contain both the raw and interpreted form, we never have to convert between the forms except at parse time.

