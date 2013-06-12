
Spacebars = {};

var makeStacheTagStartRegex = function (r) {
  return new RegExp(r.source + /(?![{>!#/])/.source,
                    r.ignoreCase ? 'i' : '');
};

var prettyOffset = function (code, pos) {
  var codeUpToPos = code.substring(0, pos);
  var startOfLine = codeUpToPos.lastIndexOf('\n') + 1;
  var indexInLine = pos - startOfLine; // 0-based
  var lineNum = codeUpToPos.replace(/[^\n]+/g, '').length + 1; // 1-based
  return "line " + lineNum + ", offset " + indexInLine;
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

Spacebars.starts = starts;

// Parse a tag at `pos` in `inputString`.  Succeeds or errors.
Spacebars.parseStacheTag = function (inputString, pos) {
  pos = pos || 0;
  var startPos = pos;
  var str = inputString.slice(pos);

  var lexer = new JSLexer(inputString);

  var advance = function (amount) {
    str = str.slice(amount);
    pos += amount;
  };

  var run = function (regex) {
    // regex is assumed to start with `^`
    var result = regex.exec(str);
    if (! result)
      return null;
    var ret = result[0];
    advance(ret.length);
    return ret;
  };

  var scanToken = function () {
    lexer.divisionPermitted = false;
    lexer.pos = pos;
    return lexer.next();
  };

  var scanIdentifier = function () {
    var tok = scanToken();
    // We don't care about overlap with JS keywords.  This code
    // won't accept "true", "false", or "null" as identifiers however.
    if (tok.type() !== 'IDENTIFIER' && tok.type() !== 'KEYWORD')
      expected('IDENTIFIER');
    var text = tok.text();
    advance(text.length);
    return text;
  };

  //var scanDottedIdentifier = function () {
  //  var name = scanIdentifier();
  //  while (run(/^\./))
  //    name += '.' + scanIdentifier();
  //  return name;
  //};

  var scanPath = function () {
    var segments = [];
    // Initial empty string in segments means `this` or `.`.
    var dots;

    // handle `.` and `./`, disallow `..`
    if ((dots = run(/^\.+/))) {
      if (dots.length > 1)
        error("`..` is not supported");
      segments.push('');
      // only thing that can follow a `.` is a `/`
      if (! run(/^\//))
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
        var id = scanIdentifier();
        if (id === 'this' && ! segments.length) {
          // initial `this`
          segments.push('');
        } else {
          segments.push(id);
        }
      }

      var sep = run(/^[\.\/]/);
      if (! sep)
        break;
      if (/^\.\./.test(str))
        error("`..` is not supported");
      if (/^\./.test(str))
        error("`.` is only allowed at start of path");
    }

    return segments;
  };

  // scan an argument; succeeds or errors
  var scanArg = function (notKeyword) {
    // all args have `type` and possibly `key`
    var tok = scanToken();
    var tokType = tok.type();
    var text = tok.text();

    if (/^[\.\[]/.test(str) && tokType !== 'NUMBER')
      return ['PATH', scanPath()];

    if (tokType === 'BOOLEAN') {
      advance(text.length);
      return ['BOOLEAN', Boolean(tok.text())];
    } else if (tokType === 'NULL') {
      advance(text.length);
      return ['NULL', null];
    } else if (tokType === 'NUMBER') {
      advance(text.length);
      return ['NUMBER', Number(tok.text())];
    } else if (tokType === 'STRING') {
      advance(text.length);
      // single quote to double quote
      if (text.slice(0, 1) === "'")
        text = '"' + text.slice(1, -1) + '"';
      // replace line continuations with `\n`
      text = text.replace(/[\r\n\u000A\u000D\u2028\u2029]/g, 'n');
      return ['STRING', JSON.parse(text)];
    } else if (tokType === 'IDENTIFIER' || tokType === 'KEYWORD') {
      if ((! notKeyword) &&
          /^\s*=/.test(str.slice(text.length))) {
        // it's a keyword argument!
        advance(text.length);
        run(/^\s*=\s*/);
        // recurse to scan value, disallowing a second `=`.
        var arg = scanArg(true);
        arg.push(text); // add third element for key
        return arg;
      }
      return ['PATH', scanPath()];
    } else {
      expected('identifier, number, string, boolean, or null');
    }
  };

  var type;

  var error = function (msg) {
    throw new Error(msg + " at " + prettyOffset(inputString, pos));
  };
  var expected = function (what) {
    error('Expected ' + what + ', found "' + str.slice(0,5) + '"');
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
    error('Unknown stache tag starting with "' + str.slice(0,5) + '"');

  var tag = { type: type };

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
    tag.path = scanPath();
    tag.args = [];
    while (true) {
      run(/^\s*/);
      if (type === 'TRIPLE') {
        if (run(ends.TRIPLE))
          break;
        else if (str.charAt(0) === '}')
          expected('`}}}`');
      } else {
        if (run(ends.DOUBLE))
          break;
        else if (str.charAt(0) === '}')
          expected('`}}`');
      }
      tag.args.push(scanArg());
      if (run(/^(?=[\s}])/) !== '')
        expected('space');
    }
  }

  tag.charPos = startPos;
  tag.charLength = pos - startPos;
  return tag;
};

var randomLetters = function () {
  var letters = "abcdefghijklmnopqrstuvwxyz";
  var str = '';
  for (var i = 0; i < 10; ++i)
    str += Random.choice(letters);
  return str;
};

var MODE_ALL_STACHE = 0;
var MODE_NO_STACHE = 1;
var MODE_NO_COMPONENTS = 2;

var tokenizeHtml = function (html, preString, postString, tagLookup) {
  var tokens = HTML5Tokenizer.tokenize(html);

  var out = [];

  var extractTags = function (str, mode, customErrorMessage) {
    // Scan `str` for substrings that are actually our
    // alphabetic markers that represent stache tags
    // (or entire blocks, which have `.type` of `'block'`
    // and `.isBlock` of `true`).
    //
    // Return either a single string (if there are no stache
    // tags) or an array, each element of which is either a
    // string or a tag or block.
    //
    // The `mode` flag can be used to restrict the allowed
    // tag types, for example by setting it to MODE_NO_STACHE
    // to disallow stache tags completely (and verify that
    // there are none).  If this flag is used,
    // `customErrorMessage` may optionally be given to replace
    // the default error message of "Can't use this stache tag
    // at this position in an HTML tag".
    if (! str)
      return '';

    var buf = [];
    var lastPos = 0;
    var pos;
    while ((pos = str.indexOf(preString, lastPos)) >= 0) {
      if (pos > lastPos)
        buf.push(str.slice(lastPos, pos));
      var idStart = pos + preString.length;
      var idEnd = str.indexOf(postString, idStart);
      if (idEnd < 0)
        throw new Error("error extracting tags"); // shouldn't happen
      var tagId = str.slice(idStart, idEnd);
      var tag = tagLookup.getTag(tagId);
      if (mode) {
        if (mode === MODE_NO_STACHE ||
            (mode === MODE_NO_COMPONENTS &&
             (tag.isBlock || tag.type === 'INCLUSION')))
          throw new Error(
            (customErrorMessage ||
             "Can't use this stache tag at this position " +
             "in an HTML tag") + ", at " +
              tagLookup.prettyOffset(tagId));
      }
      buf.push(tag);
      lastPos = idEnd + postString.length;
    }
    if (lastPos < str.length)
      buf.push(str.slice(lastPos));

    if (buf.length === 1 && typeof buf[0] === "string")
      return buf[0];

    return buf;
  };

  // Run extractTags(chrs) and make sure there are no stache tags,
  // because they are illegal in this position (e.g. HTML tag
  // name).
  var noStache = function (str, customMessage) {
    return extractTags(str, MODE_NO_STACHE, customMessage);
  };

  // Like `extractTags(str)`, but doesn't allow block helpers
  // or inclusions.
  var extractStringTags = function (str, customMessage) {
    return extractTags(str, MODE_NO_COMPONENTS, customMessage);
  };

  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (tok.type === 'Characters' ||
        tok.type === 'SpaceCharacters') {
      var s = tok.data;
      // combine multiple adjacent "Characters"; this is
      // necessary to make sure we extract the tags properly.
      while (tokens[i+1] &&
             (tokens[i+1].type === 'Characters' ||
              tokens[i+1].type === 'SpaceCharacters')) {
        tok = tokens[++i];
        s += tok.data;
      }
      out.push({type: 'Characters',
                data: extractTags(s)});
    } else if (tok.type === 'EndTag') {
      out.push({type: 'EndTag',
                name: noStache(tok.name)});
    } else if (tok.type === 'Doctype') {
      out.push({type: 'DocType',
                name: noStache(tok.name),
                correct: tok.correct,
                publicId: tok.publicId && noStache(tok.publicId),
                systemId: tok.systemId && noStache(tok.systemId)
               });
    } else if (tok.type === 'Comment') {
      out.push({type: 'Comment',
                data: extractStringTags(tok.data)});
    } else if (tok.type === 'StartTag') {
      out.push({ type: 'StartTag',
                 name: noStache(tok.name),
                 data: _.map(tok.data, function (kv) {
                   return {
                     nodeName: extractStringTags(kv.nodeName),
                     nodeValue: extractStringTags(kv.nodeValue) };
                 }),
                 self_closing: tok.self_closing
               });
    } else {
      // ignore (ParseError, EOF)
    }
  }

  return out;
};

Spacebars.parse = function (inputString) {
  // first, scan for all the stache tags

  var stacheTags = [];

  var pos = 0;
  while (pos < inputString.length) {
    pos = inputString.indexOf('{{', pos);
    if (pos < 0) {
      pos = inputString.length;
    } else {
      var tag = Spacebars.parseStacheTag(inputString, pos);
      stacheTags.push(tag);
      pos += tag.charLength;
    }
  }

  // now build a tree where block contents are put into an object
  // with `type:'block'`.  Also check that block stache tags match.

  var parseBlock = function (openTagIndex) {
    var isTopLevel = (openTagIndex < 0);
    var block = {
      type: 'block',
      isBlock: true, // always true for a block; just a type marker
      // openTag, closeTag must be present except at top level
      openTag: null,
      closeTag: null,
      bodyChildren: [], // tags and blocks
      bodyTokens: null, // filled in by a subsequent recursive pass
      // if elseTag is present, then elseChildren and elseTokens
      // must be too.
      elseTag: null,
      elseChildren: null,
      elseTokens: null
    };
    var children = block.bodyChildren; // repointed to elseChildren later
    if (! isTopLevel)
      block.openTag = stacheTags[openTagIndex];


    for (var i = (isTopLevel ? 0 : openTagIndex + 1);
         i < stacheTags.length && ! block.closeTag;
         i++) {

      var t = stacheTags[i];
      if (t.type === 'BLOCKOPEN') {
        // recurse
        var b = parseBlock(i);
        children.push(b);
        while (stacheTags[i] !== b.closeTag)
          i++;
      } else if (t.type === 'BLOCKCLOSE') {
        if (isTopLevel)
          throw new Error("Unexpected close tag `" +t.name + "` at " +
                          prettyOffset(inputString, t.charPos));
        if (t.name !== block.openTag.name)
          throw new Error("Close tag at " +
                          prettyOffset(inputString, t.charPos) +
                          " doesn't match `" + block.openTag.name +
                          "`, found `" + t.name + "`");
        block.closeTag = t;
      } else if (t.type === 'ELSE') {
        if (isTopLevel)
          throw new Error("Unexpected `{{else}}` at " +
                          prettyOffset(inputString, t.charPos));
        if (block.elseTag)
          throw new Error("Duplicate `{{else}}` at " +
                          prettyOffset(inputString, t.charPos));
        block.elseTag = t;
        children = [];
        block.elseChildren = children;
      } else {
        children.push(t);
      }
    }

    if (! isTopLevel && ! block.closeTag)
      throw new Error("Unclosed `" + block.openTag.name +
                      "` tag at top level");

    return block;
  };

  // get a tree of all the stache tags as a top-level "block"
  // whose bodyChildren are the sub-blocks and other non-block
  // stache tags.
  var tree = parseBlock(-1);

  var preString = randomLetters();
  var postString = randomLetters();
  var nextId = 1;

  var tagEnd = function (t) { return t.charPos + t.charLength; };

  var idLookup = {};

  var tagLookup = {
    prettyOffset: function (tagId) {
      var t = idLookup[tagId];
      return t ? prettyOffset(
        inputString, (t.isBlock ? t.openTag : t).charPos) :
      "(unknown)";
    },
    getTag: function (tagId) {
      return idLookup[tagId];
    }
  };

  var tokenizeBlock = function (block) {
    // Strategy: replace all child tags and blocks in the HTML
    // with random identifiers before passing to the tokenizer!
    // Because the random identifiers consist of ASCII letters,
    // they will be parsed as tokens or substrings of tokens.

    var isTopLevel = ! block.openTag;
    var hasElse = !! block.elseTag;

    var getTokens = function (children, startPos, endPos) {
      var html = '';
      var pos = startPos;
      _.each(children, function (t) {
        html += inputString.slice(
          pos, (t.isBlock ? t.openTag : t).charPos);
        idLookup[nextId] = t;
        html += preString + (nextId++) + postString;
        pos = tagEnd(t.isBlock ? t.closeTag : t);

        if (t.isBlock)
          tokenizeBlock(t); // recurse
      });
      html += inputString.slice(pos, endPos);

      return tokenizeHtml(html, preString, postString, tagLookup);
    };

    var bodyStart = (isTopLevel ? 0 : tagEnd(block.openTag));
    var bodyEnd = (isTopLevel ? inputString.length :
                   (hasElse ? block.elseTag.charPos :
                    block.closeTag.charPos));

    block.bodyTokens = getTokens(block.bodyChildren, bodyStart, bodyEnd);

    if (hasElse) {
      var elseStart = tagEnd(block.elseTag);
      var elseEnd = block.closeTag.charPos;

      block.elseTokens = getTokens(block.elseChildren, elseStart, elseEnd);
    }
  };

  tokenizeBlock(tree);

  return tree;
};

var toJSLiteral = function (obj) {
  // http://timelessrepo.com/json-isnt-a-javascript-subset
  return (JSON.stringify(obj)
          .replace(/\u2028/g, '\\u2028')
          .replace(/\u2029/g, '\\u2029'));
};

// takes an object whose keys and values are strings of
// JavaScript source code and returns the source code
// of an object literal.
var makeObjectLiteral = function (obj) {
  var buf = [];
  buf.push('{');
  for (var k in obj) {
    if (buf.length > 1)
      buf.push(', ');
    buf.push(k, ': ', obj[k]);
  }
  buf.push('}');
  return buf.join('');
};

Spacebars.compile = function (inputString) {
  var tree;
  if (typeof inputString === 'object') {
    tree = inputString; // allow passing parse tree
  } else {
    tree = Spacebars.parse(inputString);
  }

  // XXX rewrite interpolate.
  //
  // Should now return the source code of either a
  // string or a (reactive) function.  Ideally it is
  // a simple string if possible.
  //
  // Oh snap, can't do components this way.
  // Only double and triple stache.
  // Should first write the logic that parses out
  // block helpers and inclusions in a run of Characters,
  // in tokensToFunc.  These tags aren't allowed in an
  // interpolation, only double-stache and triple-stache are.
  //
  // Will need to write the lookup rules for component names,
  // helper functions, and values.  Maybe it's the same?
  // Delegates to `component.lookup(path)`?
  //
  // We will probably lose the `{{#if equal a b}}` convenience
  // syntax (but maybe introduce new syntax for this later).
  /*var interpolate = function (strOrArray, indent) {
    if (typeof strOrArray === "string")
      return toJSLiteral(strOrArray);

    var parts = [];
    _.each(strOrArray, function (strOrTagRef) {
      if (typeof strOrTagRef === "string") {
        parts.push(toJSLiteral(strOrTagRef));
      } else {
        var tagOrBlock = strOrTagRef.ref;
        if (tagOrBlock.isBlock) {
          var block = tagOrBlock;
          var openTag = block.openTag;
          parts.push('env.blockHelper(' + toJSLiteral(openTag.name) +
                     ', ' + toJSLiteral(openTag.args) +
                     ', ' + tokensToFunc(block.bodyTokens, indent) +
                     (block.elseTag ? ', ' +
                      tokensToFunc(block.elseTokens, indent)
                      : '') + ')');
        } else {
          var tag = tagOrBlock;
          switch (tag.type) {
          case 'COMMENT':
            // nothing to do
            break;
          case 'INCLUSION':
            parts.push('env.include(' + toJSLiteral(tag.name) +
                       (tag.args.length ? ', ' +toJSLiteral(tag.args) : '') +
                       ')');
            break;
          case 'DOUBLE': // fall through
          case 'TRIPLE':
            parts.push('env.' +
                       (tag.type === 'DOUBLE' ? 'dstache' : 'tstache') +
                       '(' + toJSLiteral(tag.path) +
                       (tag.args.length ? ', ' + toJSLiteral(tag.args) : '') +
                       ')');
            break;
          default:
            throw new Error("Unknown stache tag type: " + tag.type);
            //parts.push('env.tag(' + tagLiteral(tag) + ')');
          }
        }
      }
    });

    return parts.join('+');
  };*/

  // Return the source code of a string or (reactive) function
  // (if necessary).
  var interpolate = function (strOrArray, funcInfo) {
    if (typeof strOrArray === "string")
      return toJSLiteral(strOrArray);

    var parts = [];
    var isReactive = false;
    _.each(strOrArray, function (strOrTag) {
      if (typeof strOrTag === "string") {
        parts.push(toJSLiteral(strOrTag));
      } else {
        var tag = strOrTag;
        switch (tag.type) {
        case 'COMMENT':
          // nothing to do
          break;
        case 'DOUBLE': // fall through
        case 'TRIPLE':
          isReactive = true;
          parts.push('stuff()'); // XXXXXXXX
          /*          parts.push('env.' +
                       (tag.type === 'DOUBLE' ? 'dstache' : 'tstache') +
                       '(' + toJSLiteral(tag.path) +
                       (tag.args.length ? ', ' + toJSLiteral(tag.args) : '') +
                     ')');*/
            break;
          default:
            throw new Error("Unknown stache tag type: " + tag.type);
            //parts.push('env.tag(' + tagLiteral(tag) + ')');
          }
        }
    });

    if (isReactive) {
      return 'function () { return ' + parts.join('+') +
        '; }';
    } else {
      return parts.length ? parts.join('+') : '""';
    }
  };

  var tokensToRenderFunc = function (tokens, indent) {
    var oldIndent = indent || '';
    indent = oldIndent + '  ';

    var funcInfo = {
      indent: indent, // read-only
      usedSelf: false // read/write
    };

    var bodyLines = [];
    _.each(tokens, function (t) {
      switch (t.type) {
      case 'Characters':
        if (typeof t.data === 'string') {
          bodyLines.push('buf.text(' + toJSLiteral(t.data) +
                         ');');
        } else {
          _.each(t.data, function (tagOrStr) {
            if (typeof tagOrStr === 'string') {
              bodyLines.push('buf.text(' + toJSLiteral(tagOrStr) +
                             ');');
            } else {
              // tag or block
              var tag = tagOrStr;
              if (tag.isBlock) {
                // XXX implement
              } else {
                switch (tag.type) {
                case 'INCLUSION':
                  // XXX implement
                  break;
                case 'DOUBLE':
                case 'TRIPLE':
                  // XXX implement
                  break;
                case 'COMMENT':
                  break;
                default:
                  throw new Error("Unexpected tag type: " + tag.type);
                }
              }
            }
          });
        }
        break;
      case 'StartTag':
        var attrs = null;
        var dynamicAttrs = null;
        _.each(t.data, function (kv) {
          var name = kv.nodeName;
          var value = kv.nodeValue;
          if ((typeof name) !== 'string') {
            dynamicAttrs = (dynamicAttrs || []);
            dynamicAttrs.push([interpolate(name, funcInfo),
                               interpolate(value, funcInfo)]);
          } else {
            attrs = (attrs || {});
            attrs[toJSLiteral(name)] =
              interpolate(value, funcInfo);
          }
        });
        var options = null;
        if (dynamicAttrs) {
          options = (options || {});
          options['dynamicAttrs'] = '[' +
            _.map(dynamicAttrs, function (pair) {
              return '[' + pair[0] + ', ' + pair[1] + ']';
            }).join(', ') + ']';
        }
        if (t.self_closing) {
          options = (options || {});
          options['selfClose'] = 'true';
        }
        bodyLines.push(
          'buf.openTag(' + toJSLiteral(t.name) +
            ((attrs || options) ?
             ', ' + makeObjectLiteral(attrs)
             : '') +
            (options ? ', ' + makeObjectLiteral(options) : '') +
            ');');
        break;
      case 'EndTag':
        bodyLines.push('buf.closeTag(' + toJSLiteral(t.name) +
                       ');');
        break;
      case 'Comment':
        bodyLines.push('buf.comment(' +
                       interpolate(t.name, funcInfo) + ');');
        break;
      case 'DocType':
        bodyLines.push(
          'buf.doctype(' + toJSLiteral(t.name) + ', ' +
            toJSLiteral({correct: t.correct,
                         publicId: t.publicId,
                         systemId: t.systemId}) + ');');
        break;
      default:
        throw new Error("Unexpected token type: " + t.type);
        break;
      }
    });

    return 'function (buf) {' +
      (bodyLines ?
       (funcInfo.usedSelf ?
        '\n' + indent + 'var self = this;' : '') +
       '\n' + indent + bodyLines.join('\n' + indent) + '\n' :
       '') + '}';
  };

  return tokensToRenderFunc(tree.bodyTokens);
};