
var html_scanner = module.exports = {
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

    var results = {};
    html_scanner._initResults(results);

    var rOpenTag = /^((<(template|head|body)\b)|(<!--)|(<!DOCTYPE|{{!)|$)/i;

    while (rest) {
      // skip whitespace first (for better line numbers)
      advance(rest.match(/^\s*/)[0].length);

      var match = rOpenTag.exec(rest);
      if (! match)
        throw parseError(); // unknown text encountered

      advance(match.index + match[0].length);

      if (! match[1])
        break; // matched $ (end of file)
      if (match[4] === '<!--') {
        // top-level HTML comment
        var end = /-->/.exec(rest);
        if (! end)
          throw parseError("unclosed HTML comment");
        advance(end.index + end[0].length);
        continue;
      }
      if (match[5] === "<!DOCTYPE")
        throw parseError(
          "Can't set doctype here.  (Meteor sets <!DOCTYPE html> for you)");
      if (match[5] === "{{!")
        throw new parseError(
          "Can't use '{{! }}' outside a template.  Use '<!-- -->'.");

      // otherwise, a <tag>
      var tagName = match[3].toLowerCase();
      var tagAttribs = {}; // bare name -> value dict
      var rTagPart = /^\s*((([a-zA-Z0-9:_-]+)\s*=\s*"(.*?)")|(>))/;
      var attr;
      // read attributes
      while ((attr = rTagPart.exec(rest))) {
        advance(attr.index + attr[0].length);
        if (attr[1] === '>')
          break;
        // XXX we don't HTML unescape the attribute value
        // (e.g. to allow "abcd&quot;efg") or protect against
        // collisions with methods of tagAttribs (e.g. for
        // a property named toString)
        tagAttribs[attr[3]] = attr[4];
      }
      if (! attr) // didn't end on '>'
        throw new parseError("Missing '>'");
      // find </tag>
      var end = (new RegExp('</'+tagName+'>', 'i')).exec(rest);
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

  _initResults: function(results) {
    results.head = '';
    results.body = '';
    results.js = '';
  },

  _handleTag: function (results, tag, attribs, contents, parseError) {

    // trim the tag contents
    contents = contents.match(/^[ \t\r\n]*([\s\S]*?)[ \t\r\n]*$/)[1];

    if (tag === "head") {
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
      results.js += "Meteor.startup(function(){" +
        "document.body.appendChild(Meteor.ui.render(" +
        "Meteor._def_template(null," + code + ")));});";
    }
  }
};

