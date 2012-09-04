
var html_scanner = {
  // Scan a template file for <head>, <body>, and <template>
  // tags and extract their contents.
  //
  // This is a primitive, regex-based scanner.  It scans
  // top-level tags, which are allowed to have attributes,
  // and ignores top-level HTML comments.

  scan: function (contents, source_name) {
    var rest = contents;
    var index = 0;

    var advance = function(amount) {
      rest = rest.substring(amount);
      index += amount;
    };

    var parseError = function(msg) {
      var lineNumber = contents.substring(0, index).split('\n').length;
      var line = contents.split('\n')[lineNumber - 1];
      var info = "line "+lineNumber+", file "+source_name + "\n" + line;
      return new Error((msg || "Parse error")+" - "+info);
    };

    var results = html_scanner._initResults();

    var rOpenTag = /^((<(template|head|body)\b)|(<!--)|(<!DOCTYPE|{{!)|$)/i;

    while (rest) {
      // skip whitespace first (for better line numbers)
      advance(rest.match(/^\s*/)[0].length);

      var match = rOpenTag.exec(rest);
      if (! match)
        throw parseError(); // unknown text encountered

      var matchToken = match[1];
      var matchTokenTagName =  match[3];
      var matchTokenComment = match[4];
      var matchTokenUnsupported = match[5];

      advance(match.index + match[0].length);

      if (! matchToken)
        break; // matched $ (end of file)
      if (matchTokenComment === '<!--') {
        // top-level HTML comment
        var commentEnd = /--\s*>/.exec(rest);
        if (! commentEnd)
          throw parseError("unclosed HTML comment");
        advance(commentEnd.index + commentEnd[0].length);
        continue;
      }
      if (matchTokenUnsupported) {
        switch (matchTokenUnsupported.toLowerCase()) {
        case '<!doctype':
          throw parseError(
            "Can't set DOCTYPE here.  (Meteor sets <!DOCTYPE html> for you)");
        case '{{!':
          throw new parseError(
            "Can't use '{{! }}' outside a template.  Use '<!-- -->'.");
        }
        throw new parseError();
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
        throw new parseError("Parse error in tag");
      // find </tag>
      var end = (new RegExp('</'+tagName+'\\s*>', 'i')).exec(rest);
      if (! end)
        throw new parseError("unclosed <"+tagName+">");
      var tagContents = rest.slice(0, end.index);
      advance(end.index + end[0].length);

      // act on the tag
      html_scanner._handleTag(results, tagName, tagAttribs, tagContents,
                              parseError);
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

  _handleTag: function (results, tag, attribs, contents, parseError) {

    // trim the tag contents.
    // this is a courtesy and is also relied on by some unit tests.
    contents = contents.match(/^[ \t\r\n]*([\s\S]*?)[ \t\r\n]*$/)[1];

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
        throw parseError("Attributes on <head> not supported");
      results.head += contents;
      return;
    }

    // <body> or <template>
    var code = 'Handlebars.json_ast_to_func(' +
          JSON.stringify(Handlebars.to_json_ast(contents)) + ')';

    if (tag === "template") {
      var name = attribs.name;
      if (! name)
        throw parseError("Template has no 'name' attribute");

      results.js += "Meteor._def_template(" + JSON.stringify(name) + ","
        + code + ");\n";
    } else {
      // <body>
      if (hasAttribs)
        throw parseError("Attributes on <body> not supported");
      results.js += "Meteor.startup(function(){" +
        "document.body.appendChild(Spark.render(" +
        "Meteor._def_template(null," + code + ")));});";
    }
  }
};

// If we are running at bundle time, set module.exports.
// For unit testing in server environment, don't.
if (typeof module !== 'undefined')
  module.exports = html_scanner;