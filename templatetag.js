// A TemplateTag is the result of parsing a single `{{...}}` tag.
//
// The `.type` of a TemplateTag is one of:
//
// - `"DOUBLE"` - `{{foo}}`
// - `"TRIPLE"` - `{{{foo}}}`
// - `"COMMENT"` - `{{! foo}}`
// - `"INCLUSION"` - `{{> foo}}`
// - `"BLOCKOPEN"` - `{{#foo}}`
// - `"BLOCKCLOSE"` - `{{/foo}}`
// - `"ELSE"` - `{{else}}`
//
// Besides `type`, the mandatory properties of a TemplateTag are:
//
// - `path` - An array of one or more strings.  The path of `{{foo.bar}}`
//   is `["foo", "bar"]`.  Applies to DOUBLE, TRIPLE, INCLUSION, BLOCKOPEN,
//   and BLOCKCLOSE.
//
// - `args` - An array of zero or more argument specs.  An argument spec
//   is a two or three element array, consisting of a type, value, and
//   optional keyword name.  For example, the `args` of `{{foo "bar" x=3}}`
//   are `[["STRING", "bar"], ["NUMBER", 3, "x"]]`.  Applies to DOUBLE,
//   TRIPLE, INCLUSION, and BLOCKOPEN.
//
// - `value` - For COMMENT tags, a string of the comment's text.
//
// These additional are typically set during parsing:
//
// - `position` - The HTML.TEMPLATE_TAG_POSITION specifying at what sort
//   of site the TemplateTag was encountered (e.g. at element level or as
//   part of an attribute value). Its absence implies
//   HTML.TEMPLATE_TAG_POSITION.ELEMENT.
//
// - `content` and `elseContent` - When a BLOCKOPEN tag's contents are
//   parsed, they are put here.  `elseContent` will only be present if
//   an `{{else}}` was found.


TemplateTag = Spacebars.TemplateTag = function () {};

var makeStacheTagStartRegex = function (r) {
  return new RegExp(r.source + /(?![{>!#/])/.source,
                    r.ignoreCase ? 'i' : '');
};

var starts = {
  ELSE: makeStacheTagStartRegex(/^\{\{\s*else(?=[\s}])/i),
  DOUBLE: makeStacheTagStartRegex(/^\{\{\s*(?!\s)/),
  TRIPLE: makeStacheTagStartRegex(/^\{\{\{\s*(?!\s)/),
  COMMENT: makeStacheTagStartRegex(/^\{\{\s*!/),
  INCLUSION: makeStacheTagStartRegex(/^\{\{\s*>\s*(?!\s)/),
  BLOCKOPEN: makeStacheTagStartRegex(/^\{\{\s*#\s*(?!\s)/),
  BLOCKCLOSE: makeStacheTagStartRegex(/^\{\{\s*\/\s*(?!\s)/)
};

var ends = {
  DOUBLE: /^\s*\}\}/,
  TRIPLE: /^\s*\}\}\}/
};

// Parse a tag from the provided scanner or string.  If the input
// doesn't start with `{{`, returns null.  Otherwise, either succeeds
// and returns a Spacebars.TemplateTag, or throws an error (using
// `scanner.fatal` if a scanner is provided).
TemplateTag.parse = function (scannerOrString) {
  var scanner = scannerOrString;
  if (typeof scanner === 'string')
    scanner = new HTML.Scanner(scannerOrString);

  if (! (scanner.peek() === '{' &&
         (scanner.rest()).slice(0, 2) === '{{'))
    return null;

  var run = function (regex) {
    // regex is assumed to start with `^`
    var result = regex.exec(scanner.rest());
    if (! result)
      return null;
    var ret = result[0];
    scanner.pos += ret.length;
    return ret;
  };

  var advance = function (amount) {
    scanner.pos += amount;
  };

  var scanIdentifier = function (isFirstInPath) {
    var id = parseIdentifierName(scanner);
    if (! id)
      expected('IDENTIFIER');
    if (isFirstInPath &&
        (id === 'null' || id === 'true' || id === 'false'))
      scanner.fatal("Can't use null, true, or false, as an identifier at start of path");

    return id;
  };

  var scanPath = function () {
    var segments = [];

    // handle initial `.`, `..`, `./`, `../`, `../..`, `../../`, etc
    var dots;
    if ((dots = run(/^[\.\/]+/))) {
      var ancestorStr = '.'; // eg `../../..` maps to `....`
      var endsWithSlash = /\/$/.test(dots);

      if (endsWithSlash)
        dots = dots.slice(0, -1);

      _.each(dots.split('/'), function(dotClause, index) {
        if (index === 0) {
          if (dotClause !== '.' && dotClause !== '..')
            expected("`.`, `..`, `./` or `../`");
        } else {
          if (dotClause !== '..')
            expected("`..` or `../`");
        }

        if (dotClause === '..')
          ancestorStr += '.';
      });

      segments.push(ancestorStr);

      if (!endsWithSlash)
        return segments;
    }

    while (true) {
      // scan a path segment

      if (run(/^\[/)) {
        var seg = run(/^[\s\S]*?\]/);
        if (! seg)
          error("Unterminated path segment");
        seg = seg.slice(0, -1);
        if (! seg && ! segments.length)
          error("Path can't start with empty string");
        segments.push(seg);
      } else {
        var id = scanIdentifier(! segments.length);
        if (id === 'this' && ! segments.length) {
          // initial `this`
          segments.push('.');
        } else {
          segments.push(id);
        }
      }

      var sep = run(/^[\.\/]/);
      if (! sep)
        break;
    }

    return segments;
  };

  // scan an argument; succeeds or errors
  var scanArg = function (notKeyword) {
    var startPos = scanner.pos;
    var result;
    if ((result = parseNumber(scanner))) {
      return ['NUMBER', result.value];
    } else if ((result = parseStringLiteral(scanner))) {
      return ['STRING', result.value];
    } else if (/^[\.\[]/.test(scanner.peek())) {
      return ['PATH', scanPath()];
    } else if ((result = parseIdentifierName(scanner))) {
      var id = result;
      if (id === 'null') {
        return ['NULL', null];
      } else if (id === 'true' || id === 'false') {
        return ['BOOLEAN', id === 'true'];
      } else {
        if ((! notKeyword) &&
            /^\s*=/.test(scanner.rest())) {
          // it's a keyword argument!
          run(/^\s*=\s*/);
          // recurse to scan value, disallowing a second `=`.
          var arg = scanArg(true);
          arg.push(id); // add third element for key
          return arg;
        } else {
          scanner.pos = startPos; // unconsume `id`
          return ['PATH', scanPath()];
        }
      }
    } else {
      expected('identifier, number, string, boolean, or null');
    }
  };

  var type;

  var error = function (msg) {
    scanner.fatal(msg);
  };

  var expected = function (what) {
    error('Expected ' + what);
  };

  // must do ELSE first; order of others doesn't matter

  if (run(starts.ELSE)) type = 'ELSE';
  else if (run(starts.DOUBLE)) type = 'DOUBLE';
  else if (run(starts.TRIPLE)) type = 'TRIPLE';
  else if (run(starts.COMMENT)) type = 'COMMENT';
  else if (run(starts.INCLUSION)) type = 'INCLUSION';
  else if (run(starts.BLOCKOPEN)) type = 'BLOCKOPEN';
  else if (run(starts.BLOCKCLOSE)) type = 'BLOCKCLOSE';
  else
    error('Unknown stache tag');

  var tag = new TemplateTag;
  tag.type = type;

  if (type === 'COMMENT') {
    var result = run(/^[\s\S]*?\}\}/);
    if (! result)
      error("Unclosed comment");
    tag.value = result.slice(0, -2);
  } else if (type === 'BLOCKCLOSE') {
    tag.path = scanPath();
    if (! run(ends.DOUBLE))
      expected('`}}`');
  } else if (type === 'ELSE') {
    if (! run(ends.DOUBLE))
      expected('`}}`');
  } else {
    // DOUBLE, TRIPLE, BLOCKOPEN, INCLUSION
    tag.path = scanPath();
    tag.args = [];
    while (true) {
      run(/^\s*/);
      if (type === 'TRIPLE') {
        if (run(ends.TRIPLE))
          break;
        else if (scanner.peek() === '}')
          expected('`}}}`');
      } else {
        if (run(ends.DOUBLE))
          break;
        else if (scanner.peek() === '}')
          expected('`}}`');
      }
      tag.args.push(scanArg());
      if (run(/^(?=[\s}])/) !== '')
        expected('space');
    }
  }

  return tag;
};

// Returns a Spacebars.TemplateTag parsed from `scanner`, leaving scanner
// at its original position.
//
// An error will still be thrown if there is not a valid template tag at
// the current position.
TemplateTag.peek = function (scanner) {
  var startPos = scanner.pos;
  var result = TemplateTag.parse(scanner);
  scanner.pos = startPos;
  return result;
};

// Like `TemplateTag.parse`, but in the case of blocks, parse the complete
// `{{#foo}}...{{/foo}}` with `content` and possible `elseContent`, rather
// than just the BLOCKOPEN tag.
//
// In addition:
//
// - Throws an error if `{{else}}` or `{{/foo}}` tag is encountered.
//
// - Returns `null` for a COMMENT.  (This case is distinguishable from
//   parsing no tag by the fact that the scanner is advanced.)
//
// - Takes an HTML.TEMPLATE_TAG_POSITION `position` and sets it as the
//   TemplateTag's `.position` property.
//
// - Validates the tag's well-formedness and legality at in its position.
TemplateTag.parseCompleteTag = function (scannerOrString, position) {
  var scanner = scannerOrString;
  if (typeof scanner === 'string')
    scanner = new HTML.Scanner(scannerOrString);

  var startPos = scanner.pos; // for error messages
  var result = TemplateTag.parse(scannerOrString);
  if (! result)
    return result;

  if (result.type === 'COMMENT')
    return null;

  if (result.type === 'ELSE')
    scanner.fatal("Unexpected {{else}}");

  if (result.type === 'BLOCKCLOSE')
    scanner.fatal("Unexpected closing template tag");

  position = (position || HTML.TEMPLATE_TAG_POSITION.ELEMENT);
  if (position !== HTML.TEMPLATE_TAG_POSITION.ELEMENT)
    result.position = position;

  if (result.type === 'BLOCKOPEN') {
    // parse block contents

    // Construct a string version of `.path` for comparing start and
    // end tags.  For example, `foo/[0]` was parsed into `["foo", "0"]`
    // and now becomes `foo,0`.  This form may also show up in error
    // messages.
    var blockName = result.path.join(',');

    var textMode = null;
      if (blockName === 'markdown' ||
          position === HTML.TEMPLATE_TAG_POSITION.IN_RAWTEXT) {
        textMode = HTML.TEXTMODE.STRING;
      } else if (position === HTML.TEMPLATE_TAG_POSITION.IN_RCDATA ||
                 position === HTML.TEMPLATE_TAG_POSITION.IN_ATTRIBUTE) {
        textMode = HTML.TEXTMODE.RCDATA;
      }
      var parserOptions = {
        getSpecialTag: TemplateTag.parseCompleteTag,
        shouldStop: isAtBlockCloseOrElse,
        textMode: textMode
      };
    result.content = HTML.parseFragment(scanner, parserOptions);

    if (scanner.rest().slice(0, 2) !== '{{')
      scanner.fatal("Expected {{else}} or block close for " + blockName);

    var lastPos = scanner.pos; // save for error messages
    var tmplTag = TemplateTag.parse(scanner); // {{else}} or {{/foo}}

    if (tmplTag.type === 'ELSE') {
      // parse {{else}} and content up to close tag
      result.elseContent = HTML.parseFragment(scanner, parserOptions);

      if (scanner.rest().slice(0, 2) !== '{{')
        scanner.fatal("Expected block close for " + blockName);

      lastPos = scanner.pos;
      tmplTag = TemplateTag.parse(scanner);
    }

    if (tmplTag.type === 'BLOCKCLOSE') {
      var blockName2 = tmplTag.path.join(',');
      if (blockName !== blockName2) {
        scanner.pos = lastPos;
        scanner.fatal('Expected tag to close ' + blockName + ', found ' +
                      blockName2);
      }
    } else {
      scanner.pos = lastPos;
      scanner.fatal('Expected tag to close ' + blockName + ', found ' +
                    tmplTag.type);
    }
  }

  var finalPos = scanner.pos;
  scanner.pos = startPos;
  validateTag(result, scanner);
  scanner.pos = finalPos;

  return result;
};

var isAtBlockCloseOrElse = function (scanner) {
  // Detect `{{else}}` or `{{/foo}}`.
  //
  // We do as much work ourselves before deferring to `TemplateTag.peek`,
  // for efficiency (we're called for every input token) and to be
  // less obtrusive, because `TemplateTag.peek` will throw an error if it
  // sees `{{` followed by a malformed tag.
  var rest, type;
  return (scanner.peek() === '{' &&
          (rest = scanner.rest()).slice(0, 2) === '{{' &&
          /^\{\{\s*(\/|else\b)/.test(rest) &&
          (type = TemplateTag.peek(scanner).type) &&
          (type === 'BLOCKCLOSE' || type === 'ELSE'));
};

// Validate that `templateTag` is correctly formed and legal for its
// HTML position.  Use `scanner` to report errors. On success, does
// nothing.
var validateTag = function (ttag, scanner) {

  if (ttag.type === 'INCLUSION') {
    // throw error on >1 positional arguments
    var numPosArgs = 0;
    var args = ttag.args;
    for (var i = 0; i < args.length; i++)
      if (args[i].length === 2)
        numPosArgs++;
    if (numPosArgs > 1)
      scanner.fatal("Only one positional argument is allowed in {{> ... }}");
  }

  var position = ttag.position || HTML.TEMPLATE_TAG_POSITION.ELEMENT;
  if (position === HTML.TEMPLATE_TAG_POSITION.IN_ATTRIBUTE) {
    if (ttag.type === 'DOUBLE') {
      return;
    } else if (ttag.type === 'BLOCKOPEN') {
      var path = ttag.path;
      var path0 = path[0];
      if (! (path.length === 1 && (path0 === 'if' ||
                                   path0 === 'unless' ||
                                   path0 === 'with' ||
                                   path0 === 'each'))) {
        scanner.fatal("Custom block helpers are not allowed in an HTML attribute, only built-in ones like #each and #if");
      }
    } else {
      scanner.fatal(ttag.type + " template tag is not allowed in an HTML attribute");
    }
  } else if (position === HTML.TEMPLATE_TAG_POSITION.IN_START_TAG) {
    if (! (ttag.type === 'DOUBLE')) {
      scanner.fatal("Reactive HTML attributes must either have a constant name or consist of a single {{helper}} providing a dictionary of names and values.  A template tag of type " + ttag.type + " is not allowed here.");
    }
    if (scanner.peek() === '=') {
      scanner.fatal("Template tags are not allowed in attribute names, only in attribute values or in the form of a single {{helper}} that evaluates to a dictionary of name=value pairs.");
    }
  }

};
