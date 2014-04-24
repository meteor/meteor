


Spacebars.parse = function (input) {

  var tree = HTMLTools.parseFragment(
    input,
    { getTemplateTag: TemplateTag.parseCompleteTag });

  return tree;
};



// ============================================================
// Code-generation of template tags

var builtInBlockHelpers = {
  'if': 'UI.If',
  'unless': 'UI.Unless',
  'with': 'Spacebars.With',
  'each': 'UI.Each'
};

// These must be prefixed with `UI.` when you use them in a template.
var builtInLexicals = {
  'contentBlock': 'template.__content',
  'elseBlock': 'template.__elseContent'
};

// A "reserved name" can't be used as a <template> name.  This
// function is used by the template file scanner.
Spacebars.isReservedName = function (name) {
  return builtInBlockHelpers.hasOwnProperty(name);
};

var codeGenTemplateTag = function (tag) {
  if (tag.position === HTMLTools.TEMPLATE_TAG_POSITION.IN_START_TAG) {
    // only `tag.type === 'DOUBLE'` allowed (by earlier validation)
    return BlazeTools.EmitCode('function () { return ' +
                         codeGenMustache(tag.path, tag.args, 'attrMustache')
                         + '; }');
  } else {
    if (tag.type === 'DOUBLE') {
      return BlazeTools.EmitCode('function () { return ' +
                           codeGenMustache(tag.path, tag.args) + '; }');
    } else if (tag.type === 'TRIPLE') {
      return BlazeTools.EmitCode('function () { return Spacebars.makeRaw(' +
                           codeGenMustache(tag.path, tag.args) + '); }');
    } else if (tag.type === 'INCLUSION' || tag.type === 'BLOCKOPEN') {
      var path = tag.path;

      if (tag.type === 'BLOCKOPEN' &&
          builtInBlockHelpers.hasOwnProperty(path[0])) {
        // if, unless, with, each.
        //
        // If someone tries to do `{{> if}}`, we don't
        // get here, but an error is thrown when we try to codegen the path.

        // Note: If we caught these errors earlier, while scanning, we'd be able to
        // provide nice line numbers.
        if (path.length > 1)
          throw new Error("Unexpected dotted path beginning with " + path[0]);
        if (! tag.args.length)
          throw new Error("#" + path[0] + " requires an argument");

        var codeParts = codeGenInclusionParts(tag);
        var dataFunc = codeParts.dataFunc; // must exist (tag.args.length > 0)
        var contentBlock = codeParts.content; // must exist
        var elseContentBlock = codeParts.elseContent; // may not exist

        var callArgs = [dataFunc, contentBlock];
        if (elseContentBlock)
          callArgs.push(elseContentBlock);

        return BlazeTools.EmitCode(
          builtInBlockHelpers[path[0]] + '(' + callArgs.join(', ') + ')');

      } else {
        var compCode = codeGenPath(path, {lookupTemplate: true});

        if (path.length !== 1) {
          // path code may be reactive; wrap it
          compCode = 'function () { return ' + compCode + '; }';
        }

        var codeParts = codeGenInclusionParts(tag);
        var dataFunc = codeParts.dataFunc;
        var content = codeParts.content;
        var elseContent = codeParts.elseContent;

        var includeArgs = [compCode];
        if (content) {
          includeArgs.push(content);
          if (elseContent)
            includeArgs.push(elseContent);
        }

        var includeCode =
              'Spacebars.include(' + includeArgs.join(', ') + ')';

        if (dataFunc) {
          includeCode =
            'Spacebars.TemplateWith(' + dataFunc + ', UI.block(' +
            Spacebars.codeGen(BlazeTools.EmitCode(includeCode)) + '))';
        }

        if (path[0] === 'UI' &&
            (path[1] === 'contentBlock' || path[1] === 'elseBlock')) {
          includeCode = 'UI.InTemplateScope(template, ' + includeCode + ')';
        }

        return BlazeTools.EmitCode(includeCode);
      }
    } else {
      // Can't get here; TemplateTag validation should catch any
      // inappropriate tag types that might come out of the parser.
      throw new Error("Unexpected template tag type: " + tag.type);
    }
  }
};

var makeObjectLiteral = function (obj) {
  var parts = [];
  for (var k in obj)
    parts.push(BlazeTools.toObjectLiteralKey(k) + ': ' + obj[k]);
  return '{' + parts.join(', ') + '}';
};

// `path` is an array of at least one string.
//
// If `path.length > 1`, the generated code may be reactive
// (i.e. it may invalidate the current computation).
//
// No code is generated to call the result if it's a function.
//
// Options:
//
// - lookupTemplate {Boolean} If true, generated code also looks in
//   the list of templates. (After helpers, before data context).
//   Used when generating code for `{{> foo}}` or `{{#foo}}`. Only
//   used for non-dotted paths.
var codeGenPath = function (path, opts) {
  if (builtInBlockHelpers.hasOwnProperty(path[0]))
    throw new Error("Can't use the built-in '" + path[0] + "' here");
  // Let `{{#if UI.contentBlock}}` check whether this template was invoked via
  // inclusion or as a block helper, in addition to supporting
  // `{{> UI.contentBlock}}`.
  if (path.length >= 2 &&
      path[0] === 'UI' && builtInLexicals.hasOwnProperty(path[1])) {
    if (path.length > 2)
      throw new Error("Unexpected dotted path beginning with " +
                      path[0] + '.' + path[1]);
    return builtInLexicals[path[1]];
  }

  var args = [BlazeTools.toJSLiteral(path[0])];
  var lookupMethod = 'lookup';
  if (opts && opts.lookupTemplate && path.length === 1)
    lookupMethod = 'lookupTemplate';
  var code = 'self.' + lookupMethod + '(' + args.join(', ') + ')';

  if (path.length > 1) {
    code = 'Spacebars.dot(' + code + ', ' +
      _.map(path.slice(1), BlazeTools.toJSLiteral).join(', ') + ')';
  }

  return code;
};

// Generates code for an `[argType, argValue]` argument spec,
// ignoring the third element (keyword argument name) if present.
//
// The resulting code may be reactive (in the case of a PATH of
// more than one element) and is not wrapped in a closure.
var codeGenArgValue = function (arg) {
  var argType = arg[0];
  var argValue = arg[1];

  var argCode;
  switch (argType) {
  case 'STRING':
  case 'NUMBER':
  case 'BOOLEAN':
  case 'NULL':
    argCode = BlazeTools.toJSLiteral(argValue);
    break;
  case 'PATH':
    argCode = codeGenPath(argValue);
    break;
  default:
    // can't get here
    throw new Error("Unexpected arg type: " + argType);
  }

  return argCode;
};

// Generates a call to `Spacebars.fooMustache` on evaluated arguments.
// The resulting code has no function literals and must be wrapped in
// one for fine-grained reactivity.
var codeGenMustache = function (path, args, mustacheType) {
  var nameCode = codeGenPath(path);
  var argCode = codeGenMustacheArgs(args);
  var mustache = (mustacheType || 'mustache');

  return 'Spacebars.' + mustache + '(' + nameCode +
    (argCode ? ', ' + argCode.join(', ') : '') + ')';
};

// returns: array of source strings, or null if no
// args at all.
var codeGenMustacheArgs = function (tagArgs) {
  var kwArgs = null; // source -> source
  var args = null; // [source]

  // tagArgs may be null
  _.each(tagArgs, function (arg) {
    var argCode = codeGenArgValue(arg);

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

// Takes an inclusion tag and returns an object containing these properties,
// all optional, whose values are JS source code:
//
// - `dataFunc` - source code of a data function literal
// - `content` - source code of a content block
// - `elseContent` - source code of an elseContent block
//
// Implements the calling convention for inclusions.
var codeGenInclusionParts = function (tag) {
  var ret = {};

  if ('content' in tag) {
    ret.content = (
      'UI.block(' + Spacebars.codeGen(tag.content) + ')');
  }
  if ('elseContent' in tag) {
    ret.elseContent = (
      'UI.block(' + Spacebars.codeGen(tag.elseContent) + ')');
  }

  var dataFuncCode = null;

  var args = tag.args;
  if (! args.length) {
    // e.g. `{{#foo}}`
    return ret;
  } else if (args[0].length === 3) {
    // keyword arguments only, e.g. `{{> point x=1 y=2}}`
    var dataProps = {};
    _.each(args, function (arg) {
      var argKey = arg[2];
      dataProps[argKey] = 'Spacebars.call(' + codeGenArgValue(arg) + ')';
    });
    dataFuncCode = makeObjectLiteral(dataProps);
  } else if (args[0][0] !== 'PATH') {
    // literal first argument, e.g. `{{> foo "blah"}}`
    //
    // tag validation has confirmed, in this case, that there is only
    // one argument (`args.length === 1`)
    dataFuncCode = codeGenArgValue(args[0]);
  } else if (args.length === 1) {
    // one argument, must be a PATH
    dataFuncCode = 'Spacebars.call(' + codeGenPath(args[0][1]) + ')';
  } else {
    dataFuncCode = codeGenMustache(args[0][1], args.slice(1),
                                   'dataMustache');
  }

  ret.dataFunc = 'function () { return ' + dataFuncCode + '; }';

  return ret;
};


// ============================================================
// Main compiler

var TemplateTagReplacer = HTML.TransformingVisitor.extend({
  visitObject: function (x) {
    if (x instanceof HTMLTools.TemplateTag)
      return codeGenTemplateTag(x);

    return HTML.TransformingVisitor.prototype.visitObject.call(this, x);
  },
  visitAttributes: function (attrs) {
    if (attrs instanceof HTMLTools.TemplateTag)
      return codeGenTemplateTag(attrs);

    // call super (e.g. for case where `attrs` is an array)
    return HTML.TransformingVisitor.prototype.visitAttributes.call(this, attrs);
  }
});

var replaceTemplateTags = function (node) {
  return (new TemplateTagReplacer).visit(node);
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

  tree = replaceTemplateTags(tree);

  var code = '(function () { var self = this; ';
  if (isTemplate) {
    // support `{{> UI.contentBlock}}` and `{{> UI.elseBlock}}` with
    // lexical scope by creating a local variable in the
    // template's render function.
    code += 'var template = this; ';
  }
  code += 'return ';
  code += BlazeTools.toJS(tree);
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
