
// @export Spacebars
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
Spacebars.parseStacheTag = function (inputString, pos, options) {
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

  var scanIdentifier = function (isFirstInPath) {
    var tok = scanToken();
    // We don't care about overlap with JS keywords,
    // but accept "true", "false", and "null" as identifiers
    // only if not isFirstInPath.
    if (! (tok.type() === 'IDENTIFIER' ||
           tok.type() === 'KEYWORD' ||
           ((! isFirstInPath) && (tok.type() === 'BOOLEAN' ||
                                  tok.type() === 'NULL')))) {
      expected('IDENTIFIER');
    }
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
        var id = scanIdentifier(! segments.length);
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
    msg = msg + " at " + prettyOffset(inputString, pos);
    if (options && options.sourceName)
      msg += " in " + options.sourceName;
    throw new Error(msg);
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

var ALLOW_ALL_STACHE = 0;
var ALLOW_NO_STACHE = 1;
var ALLOW_NO_COMPONENTS = 2;

// Double- vs triple-stache is really only a sensible distinction
// at text level.  In other contexts, we mandate one or the other
// or treat them the same.  The reason is that Meteor UI's
// HTML-generation API is high-level and does the encoding for us.
//
// In a comment, allow either and perform no escaping.  You can have
// any text in a comment except `--`.
var INTERPOLATE_COMMENT = 1;
// Only allow double in `<a href="{{foo}}">` or `<a href={{foo}}>`.
var INTERPOLATE_ATTR_VALUE = 2;

var tokenizeHtml = function (html, preString, postString, tagLookup, options) {
  var tokens = HTML5Tokenizer.tokenize(html);

  var out = [];

  var error = function (msg) {
    if (options && options.sourceName)
      msg = msg + " in " + options.sourceName;
    throw new Error(msg);
  };

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
    // tag types, for example by setting it to ALLOW_NO_STACHE
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
        error("error extracting tags"); // shouldn't happen
      var tagId = str.slice(idStart, idEnd);
      var tag = tagLookup.getTag(tagId);
      if (mode) {
        if (mode === ALLOW_NO_STACHE ||
            (mode === ALLOW_NO_COMPONENTS &&
             (tag.isBlock || tag.type === 'INCLUSION')))
          error(
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
    return extractTags(str, ALLOW_NO_STACHE, customMessage);
  };

  // Like `extractTags(str)`, but doesn't allow block helpers
  // or inclusions.
  var extractStringTags = function (str, customMessage) {
    return extractTags(str, ALLOW_NO_COMPONENTS, customMessage);
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

Spacebars.parse = function (inputString, options) {
  // first, scan for all the stache tags

  var stacheTags = [];

  var pos = 0;
  while (pos < inputString.length) {
    pos = inputString.indexOf('{{', pos);
    if (pos < 0) {
      pos = inputString.length;
    } else {
      var tag = Spacebars.parseStacheTag(
        inputString, pos,
        options && { sourceName: options.sourceName });
      stacheTags.push(tag);
      pos += tag.charLength;
    }
  }

  var error = function (msg) {
    if (options && options.sourceName)
      msg = msg + " in " + options.sourceName;
    throw new Error(msg);
  };

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
        var name = t.path.join('.');
        if (isTopLevel)
          error("Unexpected close tag `" + name + "` at " +
                prettyOffset(inputString, t.charPos));
        if (name !== block.openTag.path.join('.'))
          error("Close tag at " +
                prettyOffset(inputString, t.charPos) +
                " doesn't match `" +
                block.openTag.path.join('.') +
                "`, found `" + name + "`");
        block.closeTag = t;
      } else if (t.type === 'ELSE') {
        if (isTopLevel)
          error("Unexpected `{{else}}` at " +
                prettyOffset(inputString, t.charPos));
        if (block.elseTag)
          error("Duplicate `{{else}}` at " +
                prettyOffset(inputString, t.charPos));
        block.elseTag = t;
        children = [];
        block.elseChildren = children;
      } else {
        children.push(t);
      }
    }

    if (! isTopLevel && ! block.closeTag)
      error("Unclosed `" + block.openTag.name +
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

      return tokenizeHtml(
        html, preString, postString, tagLookup,
        options && { sourceName: options.sourceName });
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

Spacebars.compile = function (inputString, options) {
  var tree;
  if (typeof inputString === 'object') {
    tree = inputString; // allow passing parse tree
  } else {
    tree = Spacebars.parse(
      inputString,
      options && { sourceName: options.sourceName });
  }

  // XXX refactor to unify instances of this helper.
  // Spacebars should probably be a class representing
  // a Spacebars processor, with static methods aliased,
  // e.g. `Spacebars.compile` calls `(new Spacebars).compile`.
  var error = function (msg) {
    if (options && options.sourceName)
      msg = msg + " in " + options.sourceName;
    throw new Error(msg);
  };

  // `path` is an array of at least one string
  var codeGenPath = function (path, funcInfo) {
    funcInfo.usedSelf = true;

    var code = 'self.lookup(' + toJSLiteral(path[0]) + ')';

    if (path.length > 1) {
      code = 'Spacebars.index(' + code + ', ' +
        _.map(path.slice(1), toJSLiteral).join(', ') + ')';
    }

    return code;
  };

  // returns: array of source strings, or null if no
  // args at all.
  //
  // if forComponentWithOpts is truthy, perform
  // component invocation argument handling.
  // forComponentWithOpts is a map from name of keyword
  // argument to source code.  For example,
  // `{ content: "Component.extend(..." }`.
  // In this case, we return an array of exactly one string
  // containing the source code of an object literal.
  var codeGenArgs = function (tagArgs, funcInfo,
                              forComponentWithOpts) {
    var options = null; // source -> source
    var args = null; // [source]

    var forComponent = !! forComponentWithOpts;

    _.each(tagArgs, function (arg, i) {
      var argType = arg[0];
      var argValue = arg[1];

      var argCode;
      switch (argType) {
      case 'STRING':
      case 'NUMBER':
      case 'BOOLEAN':
      case 'NULL':
        argCode = toJSLiteral(argValue);
        break;
      case 'PATH':
        argCode = 'function () { return Spacebars.call(' +
          codeGenPath(argValue, funcInfo) + '); }';
        break;
      default:
        error("Unexpected arg type: " + argType);
      }

      if (arg.length > 2) {
        // keyword argument
        options = (options || {});
        if (! (forComponentWithOpts &&
               (arg[2] in forComponentWithOpts))) {
          options[toJSLiteral(arg[2])] = argCode;
        }
      } else {
        // positional argument
        if (forComponent) {
          // for Components, only take one positional
          // argument, and call it `data`
          if (i === 0) {
            options = (options || {});
            options[toJSLiteral('data')] = argCode;
          }
        } else {
          args = (args || []);
          args.push(argCode);
        }
      }
    });

    if (forComponent) {
      _.each(forComponentWithOpts, function (v, k) {
        options = (options || {});
        options[toJSLiteral(k)] = v;
      });

      // components get one argument, the options dictionary
      args = [options ? makeObjectLiteral(options) : '{}'];
    } else {
      // put options as dictionary at end of args
      if (options) {
        args = (args || []);
        args.push(makeObjectLiteral(options));
      }
    }

    return args;
  };

  var codeGenComponent = function (path, args, funcInfo,
                                   compOptions) {

    var nameCode = codeGenPath(path, funcInfo);
    var argCode = args.length ?
          codeGenArgs(args, funcInfo, compOptions || {})[0] : null;

    // XXX provide a better error message if
    // `foo` in `{{> foo}}` is not found?
    // Instead of `null`, we could evaluate to the path
    // as a string, and then the renderer could choke on
    // that in a way where it ends up in the error message.

    var compFunc = 'function () { return ((' + nameCode +
          ') || null); }';

    if (path.length === 1)
      compFunc = 'Template[' + toJSLiteral(path[0]) + '] || ' + compFunc;

    return '{child: ' + compFunc + (argCode ? ', props: ' + argCode : '') +
      '}';
  };

  var codeGenBasicStache = function (tag, funcInfo) {
    var nameCode = codeGenPath(tag.path, funcInfo);
    var argCode = codeGenArgs(tag.args, funcInfo);

    return 'Spacebars.call(' + nameCode +
      (argCode ? ', ' + argCode.join(', ') : '') + ')';
  };

  // Return the source code of a string or (reactive) function
  // (if necessary).
  var interpolate = function (strOrArray, funcInfo, interpolateMode) {
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
          if (interpolateMode === INTERPOLATE_ATTR_VALUE &&
              tag.type === 'TRIPLE')
            error("Can't have a triple-stache in an attribute value");
          parts.push(codeGenBasicStache(tag, funcInfo));
          break;
        default:
          // the parser would have errored on any components
          // inside an HTML tag, so no other stache tag
          // types possible.
          error("Unknown stache tag type: " + tag.type);
        }
      }
    });

//    if (isReactive) {
//      return 'function () { return ' + parts.join('+') +
//        '; }';
//    } else {
      return parts.length ? parts.join('+') : '""';
//    }
  };

  var tokensToRenderFunc = function (tokens, indent) {
    var oldIndent = indent || '';
    indent = oldIndent + '  ';

    var funcInfo = {
      indent: indent, // read-only
      usedSelf: false // read/write
    };

    var renderables = [];

    var lastString = -1;
    var renderableString = function (str) {
      var escaped = toJSLiteral(str);

      var N = renderables.length;
      if (N && lastString === N - 1) {
        renderables[N - 1] = renderables[N - 1].slice(0, -1) +
          escaped.slice(1);
      } else {
        lastString = N;
        renderables.push(escaped);
      }
    };

    _.each(tokens, function (t) {
      switch (t.type) {
      case 'Characters':
        if (typeof t.data === 'string') {
          renderableString(
            UI.encodeSpecialEntities(t.data));
        } else {
          _.each(t.data, function (tagOrStr) {
            if (typeof tagOrStr === 'string') {
              renderableString(
                UI.encodeSpecialEntities(tagOrStr));
            } else {
              // tag or block
              var tag = tagOrStr;
              if (tag.isBlock) {
                // XXX as an optimization, move these inner
                // Component classes out so they become
                // members of the enclosing class, so they
                // aren't created per call to render.
                var block = tag;
                var extraArgs = {
                  content: 'UI.Component.extend({render: ' +
                    tokensToRenderFunc(block.bodyTokens, indent) +
                    '})'
                };
                if (block.elseTokens) {
                  extraArgs.elseContent =
                    'UI.Component.extend({render: ' +
                    tokensToRenderFunc(block.elseTokens, indent) +
                    '})';
                }
                renderables.push(codeGenComponent(
                  block.openTag.path,
                  block.openTag.args,
                  funcInfo, extraArgs));
              } else {
                switch (tag.type) {
                case 'INCLUSION':
                  renderables.push(codeGenComponent(
                    tag.path, tag.args, funcInfo));
                  break;
                case 'DOUBLE':
                case 'TRIPLE':
                  renderables.push(
                    'UI.' + (tag.type === 'TRIPLE' ? 'HTML' : 'Text') +
                      '.withData(function () { return ' +
                      codeGenBasicStache(tag, funcInfo) +
                      '; })');
                  break;
                case 'COMMENT':
                  break;
                default:
                  error("Unexpected tag type: " + tag.type);
                }
              }
            }
          });
        }
        break;
      case 'StartTag':
        // no space between tag name and attrs obj required
        renderableString("<" + t.name);

        if (t.data && t.data.length) {
          var isReactive = false;
          var attrs = {};
          var pairsWithReactiveNames = [];
          _.each(t.data, function (kv) {
            var name = kv.nodeName;
            var value = kv.nodeValue;
            if ((typeof name) === 'string') {
              attrs = (attrs || {});
              attrs[toJSLiteral(name)] =
                interpolate(value, funcInfo,
                            INTERPOLATE_ATTR_VALUE);
              if ((typeof value) !== 'string')
                isReactive = true;
            } else if (value === '' &&
                       name.length === 1 &&
                       name[0].type === 'TRIPLE') {
              renderables.push(
                '{attrs: function () { return Spacebars.parseAttrs(' +
                  codeGenBasicStache(name[0], funcInfo) + '); }}');
            } else {
              pairsWithReactiveNames.push(
                interpolate(name, funcInfo,
                            INTERPOLATE_ATTR_VALUE),
                interpolate(name, funcInfo,
                            INTERPOLATE_ATTR_VALUE));
              isReactive = true;
            }
          });
          var attrCode = makeObjectLiteral(attrs);
          if (pairsWithReactiveNames.length) {
            attrCode = 'Spacebars.extend(' + attrCode +
              ', ' + pairsWithReactiveNames.join(', ') + ')';
          }
          if (isReactive)
            attrCode = ('function () { return ' + attrCode +
                        '; }');
          renderables.push('{attrs: ' + attrCode + '}');
        }

        renderableString(
          t.self_closing ? '/>' : '>');
        break;
      case 'EndTag':
        renderableString('</' + t.name + '>');
        break;
      case 'Comment':
        // XXX make comments reactive?  no clear use case.
        // here we allow double and triple stache and
        // only run it once.
        renderableString('<!--');
        renderables.push('Spacebars.escapeHtmlComment(' +
                         interpolate(t.name, funcInfo,
                                     INTERPOLATE_COMMENT));
        renderableString('-->');
        break;
      case 'DocType':
        // XXX output a proper doctype based on
        // t.name, t.correct, t.publicId, t.systemId
        break;
      default:
        error("Unexpected token type: " + t.type);
        break;
      }
    });

    return 'function (buf) {' +
      (renderables.length ?
       (funcInfo.usedSelf ?
        '\n' + indent + 'var self = this;' : '') +
       '\n' + indent + 'buf.write(' +
       renderables.join(',\n' + indent) + ');\n' +
       oldIndent : '') + '}';
  };

  return tokensToRenderFunc(tree.bodyTokens);
};

Spacebars.index = function (value/*, identifiers*/) {
  var identifiers = Array.prototype.slice.call(arguments, 1);

  // The object we got `curValue` from by indexing.
  // For the value itself, we don't know the appropriate value
  // of `this`, so we assume it is already bound.
  var nextThis = null;

  _.each(identifiers, function (id) {
    if (typeof value === 'function') {
      // Call a getter -- in `{{foo.bar}}`, call `foo()` if it
      // is a function before indexing it with `bar`.
      //
      // In `{{foo blah=FooComponent.Bar}}`, treat
      // `FooComponent` as a non-function.
      value = value.call(nextThis);
    }
    nextThis = value;
    if (value)
      value = value[id];
  });

  if (typeof value === 'function') {
    // bind `this` for resulting function, so it can be
    // called with `Spacebars.call`.
    value = _.bind(value, nextThis);
  }

  return value;
};

Spacebars.call = function (value/*, args*/) {
  if (typeof value !== 'function')
    return value; // ignore args

  var args = Array.prototype.slice.call(arguments, 1);

  // There is a correct value of `this` for any given
  // call, but we don't know it here.  It must be
  // bound to the function in advance (so that `value`
  // is actually a wrapper which ignores its `this`
  // and supplies one).
  return value.apply(null, args);
};

Spacebars.extend = function (obj/*, k1, v1, k2, v2, ...*/) {
  for (var i = 1; i < arguments.length; i += 2)
    obj[arguments[i]] = arguments[i+1];
  return obj;
};

Spacebars.parseAttrs = function (attrs) {
  if (attrs && (typeof attrs) === 'object')
    return attrs;
  else
    throw new Error("XXX Should allow strings here");
};

Spacebars.escapeHtmlComment = function (str) {
  // comments can't have "--" in them in HTML.
  // just strip those so that we don't run into trouble.
  if ((typeof str) === 'string')
    return str.replace(/--/g, '');
  return str;
};