
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

// Parse a tag at `pos` in `inputString`.  Succeeds or errors.
Spacebars.parseStacheTag = function (scannerOrString, options) {
  var scanner = scannerOrString;
  if (typeof scanner === 'string')
    scanner = new HTML.Scanner(scannerOrString);

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

  var checkTag = function (tag) {
    if (tag.type === 'INCLUSION') {
      // throw error on >1 positional arguments
      var numPosArgs = 0;
      var args = tag.args;
      for (var i = 0; i < args.length; i++)
        if (args[i].length === 2)
          numPosArgs++;
      if (numPosArgs > 1)
        error("Only one positional argument is allowed in {{> ... }}");
    }
  };

  checkTag(tag);

  return tag;
};

Spacebars.peekStacheTag = function (scanner, options) {
  var startPos = scanner.pos;
  var result = Spacebars.parseStacheTag(scanner, options);
  scanner.pos = startPos;
  return result;
};

var makeObjectLiteral = function (obj) {
  var parts = [];
  for (var k in obj)
    parts.push(toObjectLiteralKey(k) + ': ' + obj[k]);
  return '{' + parts.join(', ') + '}';
};




//////////////////////////////////////////////////

Spacebars.parse = function (input) {
  // This implementation of `getSpecialTag` looks for "{{" and if it
  // finds it, it will parse a stache tag or fail fatally trying.
  // The object it returns is opaque to the tokenizer/parser and can
  // be anything we want.
  //
  // Parsing a block tag parses its contents and end tag too!
  var getSpecialTag = function (scanner, position) {
    if (! (scanner.peek() === '{' && // one-char peek is just an optimization
           scanner.rest().slice(0, 2) === '{{'))
      return null;

    // `parseStacheTag` will succeed or die trying.
    var lastPos = scanner.pos;
    var stache = Spacebars.parseStacheTag(scanner);
    // kill any `args: []` cluttering up the object
    if (stache.args && ! stache.args.length)
      delete stache.args;

    if (stache.type === 'ELSE') {
      scanner.pos = lastPos;
      scanner.fatal("Unexpected {{else}}");
    }
    if (stache.type === 'BLOCKCLOSE') {
      scanner.pos = lastPos;
      scanner.fatal("Unexpected closing stache tag");
    }
    if (position === HTML.TEMPLATE_TAG_POSITION.IN_ATTRIBUTE) {
      var goodPos = scanner.pos;
      scanner.pos = lastPos;
      checkAttributeStacheTag(scanner, stache);
      scanner.pos = goodPos;
    }

    if (stache.type === 'COMMENT') {
      return null; // consume the tag from the input but emit no Special
    } else if (stache.type === 'BLOCKOPEN') {
      var blockName = stache.path.join(','); // for comparisons, errors

      var textMode = null;
      if (blockName === 'markdown' ||
          position === HTML.TEMPLATE_TAG_POSITION.IN_RAWTEXT) {
        textMode = HTML.TEXTMODE.STRING;
      } else if (position === HTML.TEMPLATE_TAG_POSITION.IN_RCDATA ||
                 position === HTML.TEMPLATE_TAG_POSITION.IN_ATTRIBUTE) {
        textMode = HTML.TEXTMODE.RCDATA;
      }
      var parserOptions = {
        getSpecialTag: getSpecialTag,
        shouldStop: isAtBlockCloseOrElse,
        textMode: textMode
      };
      stache.content = HTML.parseFragment(scanner, parserOptions);

      if (scanner.rest().slice(0, 2) !== '{{')
        scanner.fatal("Expected {{else}} or block close for " + blockName);

      var lastPos = scanner.pos;
      var stache2 = Spacebars.parseStacheTag(scanner);

      if (stache2.type === 'ELSE') {
        stache.elseContent = HTML.parseFragment(scanner, parserOptions);

        if (scanner.rest().slice(0, 2) !== '{{')
          scanner.fatal("Expected block close for " + blockName);

        lastPos = scanner.pos;
        stache2 = Spacebars.parseStacheTag(scanner);
      }

      if (stache2.type === 'BLOCKCLOSE') {
        var blockName2 = stache2.path.join(',');
        if (blockName !== blockName2) {
          scanner.pos = lastPos;
          scanner.fatal('Expected tag to close ' + blockName + ', found ' +
                        blockName2);
        }
      } else {
        scanner.pos = lastPos;
        scanner.fatal('Expected tag to close ' + blockName + ', found ' +
                      stache2.type);
      }
    }

    return stache;
  };

  var isAtBlockCloseOrElse = function (scanner) {
    // we could just call parseStacheTag, but this function is called
    // for every token in the input stream, so we add some shortcuts.
    var rest, type;
    return (scanner.peek() === '{' &&
            (rest = scanner.rest()).slice(0, 2) === '{{' &&
            /^\{\{\s*(\/|else\b)/.test(rest) &&
            (type = Spacebars.peekStacheTag(scanner).type) &&
            (type === 'BLOCKCLOSE' || type === 'ELSE'));
  };

  var tree = HTML.parseFragment(input, { getSpecialTag: getSpecialTag });

  return tree;
};

// XXX think about these restrictions
var checkAttributeStacheTag = function (scanner, tag) {
  if (tag.type === 'DOUBLE') {
    return;
  } else if (tag.type === 'BLOCKOPEN') {
    var path = tag.path;
    if (! (path.length === 1 && builtInComponents.hasOwnProperty(path[0]) &&
           path[0] !== 'content' && path[0] !== 'elseContent'))
      scanner.fatal("Custom block helpers are not allowed in an HTML attribute, only built-in ones like #each and #if");
  } else {
    scanner.fatal(tag.type + " template tag is not allowed in an HTML attribute");
  }
};

var optimize = function (tree) {

  var pushRawHTML = function (array, html) {
    var N = array.length;
    if (N > 0 && (array[N-1] instanceof HTML.Raw)) {
      array[N-1] = HTML.Raw(array[N-1].value + html);
    } else {
      array.push(HTML.Raw(html));
    }
  };

  var isPureChars = function (html) {
    return (html.indexOf('&') < 0 && html.indexOf('<') < 0);
  };

  var optimizeArrayParts = function (array, optimizePartsFunc, forceOptimize) {
    var result = null;
    if (forceOptimize)
      result = [];
    for (var i = 0, N = array.length; i < N; i++) {
      var part = optimizePartsFunc(array[i]);
      if (part !== null) {
        // something special found
        if (result === null) {
          // This is our first special item.  Stringify the other parts.
          result = [];
          for (var j = 0; j < i; j++)
            pushRawHTML(result, HTML.toHTML(array[j]));
        }
        result.push(part);
      } else {
        // just plain HTML found
        if (result !== null) {
          // we've already found something special, so convert this to Raw
          pushRawHTML(result, HTML.toHTML(array[i]));
        }
      }
    }
    if (result !== null) {
      // clean up unnecessary HTML.Raw wrappers around pure character data
      for (var j = 0; j < result.length; j++) {
        if ((result[j] instanceof HTML.Raw) &&
            isPureChars(result[j].value))
          // replace HTML.Raw with simple string
          result[j] = result[j].value;
      }
    }
    return result;
  };

  var doesAttributeValueHaveSpecials = function (v) {
    if (v instanceof HTML.Special)
      return true;
    if (typeof v === 'function')
      return true;

    if (v instanceof Array) {
      for (var i = 0; i < v.length; i++)
        if (doesAttributeValueHaveSpecials(v[i]))
          return true;
      return false;
    }

    return false;
  };

  var optimizeParts = function (node) {
    // If we have nothing special going on, returns `null` (so that the
    // parent can optimize).  Otherwise returns a replacement for `node`
    // with optimized parts.
    if ((node == null) || (typeof node === 'string') ||
        (node instanceof HTML.CharRef) || (node instanceof HTML.Comment) ||
        (node instanceof HTML.Raw)) {
      // not special; let parent decide how whether to optimize
      return null;
    } else if (node instanceof HTML.Tag) {

      if (node.tagName === 'TEXTAREA' || (! HTML.isKnownElement(node.tagName))) {
        // optimizing into a TEXTAREA's RCDATA would require being a little
        // more clever.  foreign elements like SVG can't be stringified for
        // innerHTML.
        return node;
      }

      var mustOptimize = false;

      if (node.attrs) {
        var attrs = node.attrs;
        for (var k in attrs) {
          if (doesAttributeValueHaveSpecials(attrs[k])) {
            mustOptimize = true;
            break;
          }
        }
      }

      var newChildren = optimizeArrayParts(node.children, optimizeParts, mustOptimize);

      if (newChildren === null)
        return null;

      var newTag = HTML.getTag(node.tagName).apply(null, newChildren);
      newTag.attrs = node.attrs;

      return newTag;

    } else if (node instanceof Array) {
      return optimizeArrayParts(node, optimizeParts);
    } else {
      return node;
    }
  };

  var optTree = optimizeParts(tree);
  if (optTree !== null)
    // tree was optimized in parts
    return optTree;

  optTree = HTML.Raw(HTML.toHTML(tree));

  if (isPureChars(optTree.value))
    return optTree.value;

  return optTree;
};

var builtInComponents = {
  'content': '__content',
  'elseContent': '__elseContent',
  'if': 'UI.If',
  'unless': 'UI.Unless',
  'with': 'UI.With',
  'each': 'UI.Each'
};

var replaceSpecials = function (node) {
  if (node instanceof HTML.Tag) {
    // potential optimization: don't always create a new tag
    var newChildren = _.map(node.children, replaceSpecials);
    var newTag = HTML.getTag(node.tagName).apply(null, newChildren);
    newTag.attrs = Spacebars._handleSpecialAttributes(node.attrs);
    return newTag;
  } else if (node instanceof Array) {
    return _.map(node, replaceSpecials);
  } else if (node instanceof HTML.Special) {
    var tag = node.value;
    if (tag.type === 'DOUBLE') {
      return HTML.EmitCode('function () { return ' +
                           codeGenMustache(tag) + '; }');
    } else if (tag.type === 'TRIPLE') {
      return HTML.EmitCode('function () { return Spacebars.makeRaw(' +
                           codeGenMustache(tag) + '); }');
    } else if (tag.type === 'INCLUSION' || tag.type === 'BLOCKOPEN') {
      var path = tag.path;
      var compCode = codeGenPath(path);

      if (path.length === 1) {
        var compName = path[0];
        if (builtInComponents.hasOwnProperty(compName)) {
          compCode = builtInComponents[compName];
        } else {
          // toObjectLiteralKey returns `"foo"` or `foo` depending on
          // whether `foo` is a safe JavaScript identifier.
          var member = toObjectLiteralKey(path[0]);
          var templateDotFoo = (member.charAt(0) === '"' ?
                                'Template[' + member + ']' :
                                'Template.' + member);
          compCode = ('(' + templateDotFoo + ' || ' + compCode + ')');
        }
      }

      var includeArgs = codeGenInclusionArgs(tag);

      return HTML.EmitCode(
        'function () { return Spacebars.include(' + compCode +
          (includeArgs.length ? ', ' + includeArgs.join(', ') : '') +
          '); }');
    } else {
      throw new Error("Unexpected template tag type: " + tag.type);
    }
  } else {
    return node;
  }
};

var codeGenInclusionArgs = function (tag) {
  var args = null;
  var posArgs = [];

  if ('content' in tag) {
    args = (args || {});
    args.__content = (
      'UI.block(' + Spacebars.codeGen(tag.content) + ')');
  }
  if ('elseContent' in tag) {
    args = (args || {});
    args.__elseContent = (
      'UI.block(' + Spacebars.codeGen(tag.elseContent) + ')');
  }

  // precalculate the number of positional args
  var numPosArgs = 0;
  _.each(tag.args, function (arg) {
    if (arg.length === 2)
      numPosArgs++;
  });

  _.each(tag.args, function (arg) {
    var argType = arg[0];
    var argValue = arg[1];

    var isKeyword = (arg.length > 2);

    var argCode;
    switch (argType) {
    case 'STRING':
    case 'NUMBER':
    case 'BOOLEAN':
    case 'NULL':
      argCode = toJSLiteral(argValue);
      break;
    case 'PATH':
      var path = argValue;
      argCode = codeGenPath(path);
      // a single-segment path will compile to something like
      // `self.lookup("foo")` which never establishes any dependencies,
      // while `Spacebars.dot(self.lookup("foo"), "bar")` may establish
      // dependencies.
      //
      // In the multi-positional-arg construct, don't wrap pos args here.
      if (! ((path.length === 1) || (numPosArgs > 1)))
        argCode = 'function () { return Spacebars.call(' + argCode + '); }';
      break;
    default:
      // can't get here
      throw new Error("Unexpected arg type: " + argType);
    }

    if (isKeyword) {
      // keyword argument (represented as [type, value, name])
      var name = arg[2];
      args = (args || {});
      args[name] = argCode;
    } else {
      // positional argument
      posArgs.push(argCode);
    }
  });

  if (posArgs.length === 1) {
    args = (args || {});
    args.data = posArgs[0];
  } else if (posArgs.length > 1) {
    // only allowed for block helper (which has already been
    // checked at parse time); call first
    // argument as a function on the others
    args = (args || {});
    args.data = 'function () { return Spacebars.call(' + posArgs.join(', ') + '); }';
  }

  if (args)
    return [makeObjectLiteral(args)];

  return [];
};

// Input: Attribute dictionary, or null.  Attribute values may have `Special`
// nodes representing template tags.  In addition, the synthetic attribute
// `$specials` may be present and contain an array of `Special` nodes
// representing template tags in the attribute name position (i.e. "dynamic
// attributes" like `<div {{attrs}}>`).
//
// Output: If there are no Specials in the attribute values and no $specials,
// returns the input.  Otherwise, converts any `Special` nodes to functions
// and converts `$specials` to `$dynamic`.
//
// (exposed for testing)
Spacebars._handleSpecialAttributes = function (oldAttrs) {
  if (! oldAttrs)
    return oldAttrs;

  // array of Special nodes wrapping template tags
  var dynamics = null;
  if (oldAttrs.$specials && oldAttrs.$specials.length)
    dynamics = oldAttrs.$specials;

  var foundSpecials = false;

  // Runs on an attribute value, or part of an attribute value.
  // If Specials are found, converts them to EmitCode with
  // the appropriate generated code.  Otherwise, returns the
  // input.
  //
  // If specials are found, sets `foundSpecials` to true.
  var convertSpecialToEmitCode = function (v) {
    if (v instanceof HTML.Special) {
      foundSpecials = true;
      // The tag (`v.value`) has already been validated as appropriate
      // by checkAttributeStacheTag.
      return replaceSpecials(v);
    } else if (v instanceof Array) {
      return _.map(v, convertSpecialToEmitCode);
    } else {
      return v;
    }
  };

  var newAttrs = null;
  _.each(oldAttrs, function (value, name) {
    if (name.charAt(0) !== '$') {
      if (! newAttrs)
        newAttrs = {};
      newAttrs[name] = convertSpecialToEmitCode(value);
    }
  });

  if ((! dynamics) && (! foundSpecials))
    return oldAttrs;

  if (dynamics) {
    if (! newAttrs)
      newAttrs = {};
    newAttrs.$dynamic = _.map(dynamics, function (special) {
      var tag = special.value;
      return HTML.EmitCode('function () { return ' +
                           codeGenMustache(tag, 'attrMustache') + '; }');
    });
  }

  return newAttrs;
};

var codeGenMustache = function (tag, mustacheType) {
  var nameCode = codeGenPath(tag.path);
  var argCode = codeGenArgs(tag.args);
  var mustache = (mustacheType || 'mustache');

  return 'Spacebars.' + mustache + '(' + nameCode +
    (argCode ? ', ' + argCode.join(', ') : '') + ')';
};

Spacebars.compile = function (input, options) {
  var tree = Spacebars.parse(input);
  return Spacebars.codeGen(tree, options);
};

Spacebars.codeGen = function (parseTree, options) {
  // is this a template, rather than a block passed to
  // a block helper, say
  var isTemplate = (options && options.isTemplate);

  var tree = parseTree;

  // The flags `isTemplate` and `isBody` are kind of a hack.
  if (isTemplate || (options && options.isBody)) {
    // optimizing fragments would require being smarter about whether we are
    // in a TEXTAREA, say.
    tree = optimize(tree);
  }

  tree = replaceSpecials(tree);

  var code = '(function () { var self = this; ';
  if (isTemplate) {
    // support `{{> content}}` and `{{> elseContent}}` with
    // lexical scope by creating a local variable in the
    // template's render function.
    code += 'var __content = self.__content, ' +
      '__elseContent = self.__elseContent; ';
  }
  code += 'return ';
  code += HTML.toJS(tree);
  code += '; })';

  code = beautify(code);

  return code;
};

var beautify = function (code) {
  if (Package.minifiers && Package.minifiers.UglifyJSMinify) {
    var result = UglifyJSMinify(code,
                                { fromString: true,
                                  mangle: false,
                                  compress: false,
                                  output: { beautify: true,
                                            indent_level: 2,
                                            width: 80 } });
    var output = result.code;
    // Uglify interprets our expression as a statement and may add a semicolon.
    // Strip trailing semicolon.
    output = output.replace(/;$/, '');
    return output;
  } else {
    // don't actually beautify; no UglifyJS
    return code;
  }
};

// expose for compiler output tests
Spacebars._beautify = beautify;

// `path` is an array of at least one string.
//
// If `path.length > 1`, the generated code may be reactive
// (i.e. it may invalidate the current computation).
//
// No code is generated to call the result if it's a function.
var codeGenPath = function (path) {
  var code = 'self.lookup(' + toJSLiteral(path[0]) + ')';

  if (path.length > 1) {
    code = 'Spacebars.dot(' + code + ', ' +
      _.map(path.slice(1), toJSLiteral).join(', ') + ')';
  }

  return code;
};

// returns: array of source strings, or null if no
// args at all.
var codeGenArgs = function (tagArgs) {
  var kwArgs = null; // source -> source
  var args = null; // [source]

  _.each(tagArgs, function (arg) {
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
      argCode = codeGenPath(argValue);
      break;
    default:
      // can't get here
      throw new Error("Unexpected arg type: " + argType);
    }

    if (arg.length > 2) {
      // keyword argument (represented as [type, value, name])
      kwArgs = (kwArgs || {});
      kwArgs[arg[2]] = argCode;
    } else {
      // positional argument
      args = (args || []);
      args.push(argCode);
    }
  });

  // put kwArgs in options dictionary at end of args
  if (kwArgs) {
    args = (args || []);
    args.push('Spacebars.kw(' + makeObjectLiteral(kwArgs) + ')');
  }

  return args;
};
