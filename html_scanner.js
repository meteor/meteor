// XXX should allow <!-- --> comments at toplevel

var html_scanner = module.exports = {
  scan: function (contents) {
    var results = { head: '', body: '', js: '' };
    while (contents)
      contents = html_scanner._scanChunk(results, contents);
    return results;
  },

  _scanChunk: function (results, contents) {
    if (contents.match(/^\s*$/))
      return '';
    // XXX this is really terrible and buggy. it's just a proof of
    // concept, and probably will fail in all kinds of edge
    // cases. Shouldn't be too hard to clean up, though, and that's
    // probably the easiest option if we don't require that the
    // contents of a <template> block parse as valid HTML.
    var found = false;
    // XXX forEach should probably be _.each, but we don't have a good
    // way to get underscore included in this file yet, since it's
    // code that's run at bundle-time, and we can't yet eval packages
    // at bundle-time yet
    ['template', 'head', 'body'].forEach(function (tag) {
      if (found) return;
      var re = new RegExp("^\\s*<" + tag + "([^>]*?)>([\\s\\S]*?)</" + tag + ">([\\s\\S]*)$", 'i');
      var match = contents.match(re);
      if (!match) return;
      found = true;

      var attrs = match[1];
      var payload = match[2];
      contents = match[3];
      // clean up HTML-y whitespace around payload..
      match = payload.match(/^[ \t]*[\r\n]+(.*)$/);
      if (match)
        payload = match[1];
      match = payload.match(/^(.*)[\r\n]+\s*$/);
      if (match)
        payload = match[1];

      if (tag === "head") {
        results[tag] += payload;
        return;
      }

      // Strip all of the whitespace around the payload. This is so
      // that if you make a template that's supposed to be a <tr>, you
      // really get just a <tr>, and not a whitespace node, a tr, and
      // then another whitespace node. (Maybe browsers are robust to
      // this, I don't know, but we have this code for historical
      // reasons and I don't feel like rocking the boat today. Maybe
      // it should go away.) => Hard to see how this matters, since
      // {{#each foo}}{{> bar}}{{/each}} will typically end up
      // introducing whitespace around the partial invocation anyway.
      match = payload.match(/^\s*([\s\S]*)$/);
      payload = match[1];
      match = payload.match(/^([\s\S]*\S)\s*$/);
      if (match)
        payload = match[1];

      var code = 'Handlebars.json_ast_to_func(' +
        JSON.stringify(Handlebars.to_json_ast(payload)) + ')';

      if (tag === "template") {
        // XXX fails for attributes that contain whitespace, and
        // probably lots of other stuff too..
        match = attrs.match(/[$\s]name=["']?([^"'\s]+)["'\s]/);
        if (!match)
          // XXX improve error
          throw new Error("Template missing id attribute, um, somewhere ...");
        var id = match[1];

        results.js += "Meteor._def_template(" + JSON.stringify(id) + "," + code +
          ");\n";
      } else { // tag === "body"
        results.js += "Meteor.startup(function(){document.body.appendChild(Meteor.ui.render(Meteor._def_template(null," + code + ")));});";
      }
    });
    if (!found) {
      // XXX how to report an error here?
      // XXX improve error!!
      throw new Error("Couldn't parse .. um .. some HTML file, on some line. sorry");
    }

    return contents;
  }
};

