
SpacebarsCompiler.parse = function (input) {

  var tree = HTMLTools.parseFragment(
    input,
    { getTemplateTag: TemplateTag.parseCompleteTag });

  return tree;
};

SpacebarsCompiler.compile = function (input, options) {
  var tree = SpacebarsCompiler.parse(input);
  return SpacebarsCompiler.codeGen(tree, options);
};

SpacebarsCompiler._TemplateTagReplacer = HTML.TransformingVisitor.extend();
SpacebarsCompiler._TemplateTagReplacer.def({
  visitObject: function (x) {
    if (x instanceof HTMLTools.TemplateTag) {

      // Make sure all TemplateTags in attributes have the right
      // `.position` set on them.  This is a bit of a hack
      // (we shouldn't be mutating that here), but it allows
      // cleaner codegen of "synthetic" attributes like TEXTAREA's
      // "value", where the template tags were originally not
      // in an attribute.
      if (this.inAttributeValue)
        x.position = HTMLTools.TEMPLATE_TAG_POSITION.IN_ATTRIBUTE;

      return this.codegen.codeGenTemplateTag(x);
    }

    return HTML.TransformingVisitor.prototype.visitObject.call(this, x);
  },
  visitAttributes: function (attrs) {
    if (attrs instanceof HTMLTools.TemplateTag)
      return this.codegen.codeGenTemplateTag(attrs);

    // call super (e.g. for case where `attrs` is an array)
    return HTML.TransformingVisitor.prototype.visitAttributes.call(this, attrs);
  },
  visitAttribute: function (name, value, tag) {
    this.inAttributeValue = true;
    var result = this.visit(value);
    this.inAttributeValue = false;

    if (result !== value) {
      // some template tags must have been replaced, because otherwise
      // we try to keep things `===` when transforming.  Wrap the code
      // in a function as per the rules.  You can't have
      // `{id: Blaze.View(...)}` as an attributes dict because the View
      // would be rendered more than once; you need to wrap it in a function
      // so that it's a different View each time.
      return BlazeTools.EmitCode(this.codegen.codeGenBlock(result));
    }
    return result;
  }
});

SpacebarsCompiler.codeGen = function (parseTree, options) {
  // is this a template, rather than a block passed to
  // a block helper, say
  var isTemplate = (options && options.isTemplate);
  var isBody = (options && options.isBody);

  var tree = parseTree;

  // The flags `isTemplate` and `isBody` are kind of a hack.
  if (isTemplate || isBody) {
    // optimizing fragments would require being smarter about whether we are
    // in a TEXTAREA, say.
    tree = SpacebarsCompiler.optimize(tree);
  }

  var codegen = new SpacebarsCompiler.CodeGen;
  tree = (new SpacebarsCompiler._TemplateTagReplacer(
    {codegen: codegen})).visit(tree);

  var code = '(function () { ';
  if (isTemplate || isBody) {
    code += 'var view = this; ';
  }
  code += 'return ';
  code += BlazeTools.toJS(tree);
  code += '; })';

  code = SpacebarsCompiler._beautify(code);

  return code;
};

SpacebarsCompiler._beautify = function (code) {
  if (Package.minifiers && Package.minifiers.UglifyJSMinify) {
    var result = Package.minifiers.UglifyJSMinify(
      code,
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
