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

  scan: function (contents, source_name) {
    var rest = contents;
    var index = 0;

    var advance = function(amount) {
      rest = rest.substring(amount);
      index += amount;
    };

    var throwParseError = function (msg, atIndex, lineOffset) {
      atIndex = atIndex || index;
      lineOffset = lineOffset || 0;

      var ret = new html_scanner.ParseError;
      ret.message = msg || "bad formatting in HTML template";
      ret.file = source_name;
      ret.line = contents.substring(0, atIndex).split('\n').length + lineOffset;
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
      advance(end.index + end[0].length);

      // act on the tag
      html_scanner._handleTag(results, tagName, tagAttribs, tagContents,
                              throwParseError, contentsStartIndex,
                              tagStartIndex);
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
      var ast = Handlebars.to_json_ast(contents);
    } catch (e) {
      if (e instanceof Handlebars.ParseError) {
        if (typeof(e.line) === "number")
          // subtract one from e.line because it is one-based but we
          // need it to be an offset from contentsStartIndex
          throwParseError(e.message, contentsStartIndex, e.line - 1);
        else
          // No line number available from Handlebars parser, so
          // generate the parse error at the <template> tag itself
          throwParseError("error in template: " + e.message, tagStartIndex);
      }
      else
        throw e;
    }
    var code = 'Package.handlebars.Handlebars.json_ast_to_func(' +
          JSON.stringify(ast) + ')';

    if (tag === "template") {
      var name = attribs.name;
      if (! name)
        throwParseError("Template has no 'name' attribute");

      results.js += "Template.__define__(" + JSON.stringify(name) + ","
        + code + ");\n";
    } else {
      // <body>
      if (hasAttribs)
        throwParseError("Attributes on <body> not supported");
      results.js += "Meteor.startup(function(){" +
        "document.body.appendChild(Spark.render(" +
        "Template.__define__(null," + code + ")));});";
    }
  }
};
