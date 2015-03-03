html_scanner = {
  // Scan a template file for <head>, <body>, and <template>
  // tags and extract their contents.
  //
  // This is a primitive, regex-based scanner.  It scans
  // top-level tags, which are allowed to have attributes,
  // and ignores top-level HTML comments.

  // Has fields 'message', 'line', 'file'
  ParseError: function () {
  },

  bodyAttributes : [],

  scan: function (contents, source_name) {
    var rest = contents;
    var index = 0;

    var advance = function(amount) {
      rest = rest.substring(amount);
      index += amount;
    };

    var throwParseError = function (msg, overrideIndex) {
      var ret = new html_scanner.ParseError;
      ret.message = msg || "bad formatting in HTML template";
      ret.file = source_name;
      var theIndex = (typeof overrideIndex === 'number' ? overrideIndex : index);
      ret.line = contents.substring(0, theIndex).split('\n').length;
      throw ret;
    };

    var results = html_scanner._initResults();
    var rOpenTag = /^((<(template|head|body)\b)|(<!--)|(<!DOCTYPE|{{!)|$)/i;

    while (rest) {
      // skip whitespace first (for better line numbers)
      advance(rest.match(/^\s*/)[0].length);

      var match = rOpenTag.exec(rest);
      if (! match)
        throwParseError(); // unknown text encountered

      var matchToken = match[1];
      var matchTokenTagName =  match[3];
      var matchTokenComment = match[4];
      var matchTokenUnsupported = match[5];

      var tagStartIndex = index;
      advance(match.index + match[0].length);

      if (! matchToken)
        break; // matched $ (end of file)
      if (matchTokenComment === '<!--') {
        // top-level HTML comment
        var commentEnd = /--\s*>/.exec(rest);
        if (! commentEnd)
          throwParseError("unclosed HTML comment");
        advance(commentEnd.index + commentEnd[0].length);
        continue;
      }
      if (matchTokenUnsupported) {
        switch (matchTokenUnsupported.toLowerCase()) {
        case '<!doctype':
          throwParseError(
            "Can't set DOCTYPE here.  (Meteor sets <!DOCTYPE html> for you)");
        case '{{!':
          throwParseError(
            "Can't use '{{! }}' outside a template.  Use '<!-- -->'.");
        }
        throwParseError();
      }

      // otherwise, a <tag>
      var tagName = matchTokenTagName.toLowerCase();
      var tagAttribs = {}; // bare name -> value dict
      var rTagPart = /^\s*((([a-zA-Z0-9:_-]+)\s*=\s*(["'])(.*?)\4)|(>))/;
      var attr;
      // read attributes
      while ((attr = rTagPart.exec(rest))) {
        var attrToken = attr[1];
        var attrKey = attr[3];
        var attrValue = attr[5];
        advance(attr.index + attr[0].length);
        if (attrToken === '>')
          break;
        // XXX we don't HTML unescape the attribute value
        // (e.g. to allow "abcd&quot;efg") or protect against
        // collisions with methods of tagAttribs (e.g. for
        // a property named toString)
        attrValue = attrValue.match(/^\s*([\s\S]*?)\s*$/)[1]; // trim
        tagAttribs[attrKey] = attrValue;
      }
      if (! attr) // didn't end on '>'
        throwParseError("Parse error in tag");
      // find </tag>
      var end = (new RegExp('</'+tagName+'\\s*>', 'i')).exec(rest);
      if (! end)
        throwParseError("unclosed <"+tagName+">");
      var tagContents = rest.slice(0, end.index);
      var contentsStartIndex = index;

      // act on the tag
      html_scanner._handleTag(results, tagName, tagAttribs, tagContents,
                              throwParseError, contentsStartIndex,
                              tagStartIndex);

      // advance afterwards, so that line numbers in errors are correct
      advance(end.index + end[0].length);
    }

    return results;
  },

  _initResults: function() {
    var results = {};
    results.head = '';
    results.body = '';
    results.js = '';
    return results;
  },

  _handleTag: function (results, tag, attribs, contents, throwParseError,
                        contentsStartIndex, tagStartIndex) {

    // trim the tag contents.
    // this is a courtesy and is also relied on by some unit tests.
    var m = contents.match(/^([ \t\r\n]*)([\s\S]*?)[ \t\r\n]*$/);
    contentsStartIndex += m[1].length;
    contents = m[2];

    // do we have 1 or more attribs?
    var hasAttribs = false;
    for(var k in attribs) {
      if (attribs.hasOwnProperty(k)) {
        hasAttribs = true;
        break;
      }
    }

    if (tag === "head") {
      if (hasAttribs)
        throwParseError("Attributes on <head> not supported");
      results.head += contents;
      return;
    }


    // <body> or <template>

    try {
      if (tag === "template") {
        var name = attribs.name;
        if (! name)
          throwParseError("Template has no 'name' attribute");

        if (SpacebarsCompiler.isReservedName(name))
          throwParseError("Template can't be named \"" + name + "\"");

        var renderFuncCode = SpacebarsCompiler.compile(
          contents, {
            isTemplate: true,
            sourceName: 'Template "' + name + '"'
          });

        var nameLiteral = JSON.stringify(name);
        var templateDotNameLiteral = JSON.stringify("Template." + name);

        results.js += "\nTemplate.__checkName(" + nameLiteral + ");\n" +
          "Template[" + nameLiteral + "] = new Template(" +
          templateDotNameLiteral + ", " + renderFuncCode + ");\n";
      } else {
        // <body>
        if (hasAttribs) {
          // XXX we would want to throw an error here if we have duplicate
          // attributes, but this is complex to do with the current build system
          // so we won't.
          results.js += "\nMeteor.startup(function() { $('body').attr(" + JSON.stringify(attribs) + "); });\n";
        }

        var renderFuncCode = SpacebarsCompiler.compile(
          contents, {
            isBody: true,
            sourceName: "<body>"
          });

        // We may be one of many `<body>` tags.
        results.js += "\nTemplate.body.addContent(" + renderFuncCode + ");\nMeteor.startup(Template.body.renderToDocument);\n";
      }
    } catch (e) {
      if (e.scanner) {
        // The error came from Spacebars
        throwParseError(e.message, contentsStartIndex + e.offset);
      } else {
        throw e;
      }
    }
  }
};
