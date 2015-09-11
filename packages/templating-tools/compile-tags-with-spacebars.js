TemplatingTools.compileTagsWithSpacebars = function compileTagsWithSpacebars(tags) {
  var handler = new SpacebarsTagCompiler();

  tags.forEach((tag) => {
    handler.addTagToResults(tag);
  });

  return handler.getResults();
};

class SpacebarsTagCompiler {
  constructor() {
    this.results = {
      head: '',
      body: '',
      js: '',
      bodyAttrs: {}
    };
  }

  getResults() {
    return this.results;
  }

  addTagToResults(tag) {
    this.tag = tag;

    // do we have 1 or more attributes?
    const hasAttribs = ! _.isEmpty(this.tag.attribs);

    if (this.tag.tagName === "head") {
      if (hasAttribs) {
        this.throwCompileError("Attributes on <head> not supported");
      }

      this.results.head += this.tag.contents;
      return;
    }


    // <body> or <template>

    try {
      if (this.tag.tagName === "template") {
        const name = this.tag.attribs.name;

        if (! name) {
          this.throwCompileError("Template has no 'name' attribute");
        }

        if (SpacebarsCompiler.isReservedName(name)) {
          this.throwCompileError(`Template can't be named "${name}"`);
        }

        const renderFuncCode = SpacebarsCompiler.compile(this.tag.contents, {
          isTemplate: true,
          sourceName: `Template "${name}"`
        });

        this.results.js += TemplatingTools.generateTemplateJS(
          name, renderFuncCode);
      } else if (this.tag.tagName === "body") {
        this.addBodyAttrs(this.tag.attribs);

        const renderFuncCode = SpacebarsCompiler.compile(this.tag.contents, {
          isBody: true,
          sourceName: "<body>"
        });

        // We may be one of many `<body>` tags.
        this.results.js += TemplatingTools.generateBodyJS(renderFuncCode);
      } else {
        this.throwCompileError("Expected <template>, <head>, or <body> tag in template file", tagStartIndex);
      }
    } catch (e) {
      if (e.scanner) {
        // The error came from Spacebars
        this.throwCompileError(e.message, this.tag.contentsStartIndex + e.offset);
      } else {
        throw e;
      }
    }
  }

  addBodyAttrs(attrs) {
    Object.keys(attrs).forEach((attr) => {
      const val = attrs[attr];

      // This check is for conflicting body attributes in the same file;
      // we check across multiple files in caching-html-compiler using the
      // attributes on results.bodyAttrs
      if (this.results.bodyAttrs.hasOwnProperty(attr) && this.results.bodyAttrs[attr] !== val) {
        this.throwCompileError(
          `<body> declarations have conflicting values for the '${attr}' attribute.`);
      }

      this.results.bodyAttrs[attr] = val;
    });
  }

  throwCompileError(message, overrideIndex) {
    TemplatingTools.throwCompileError(this.tag, message, overrideIndex);
  }
}
