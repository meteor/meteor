if (typeof Sky === "undefined") Sky = {};

// XXX ugly hack. provides Sky._def_template, which is used to load in
// compiled templates.

// XXX disgusting hack. we want to allow Template.foo to be used as a
// Handlebars partial. uh oh -- Handlebars does templating in the
// realm of strings, but Template.foo returns a DOM object (it must,
// for event handlers to work properly). so, for now, we make the
// partial render as an empty div and fix it up later. this probably
// doesn't work in some cases, such as inside a table or ul, where
// divs don't go. this also breaks the ability to have a partial that
// isn't a single DOM element (eg, a partial that is a set of
// attributes, or a text string to be included inside an attribute..)

// XXX it'd be nice to do a better job of hiding these symbols
Sky._pending_partials = null; // id -> element
Sky._pending_partials_idx_nonce = 0;

// XXX another messy hack -- we reach into handlebars and extend #each
// to know how to cooperate with pending_partials and minimongo
// findlive.
Sky._hook_handlebars_each = function () {
  Sky._hook_handlebars_each = function(){}; // install the hook only once

  var orig = Handlebars._default_helpers.each;
  Handlebars._default_helpers.each = function (context, options) {
    if (!(context instanceof Collection.LiveResultsSet))
      return orig(context, options);

    var id = Sky._pending_partials_idx_nonce++;
    Sky._pending_partials[id] = Sky.ui.renderList(context, {
      render: Sky._def_template(null, options.fn),
      render_empty: Sky._def_template(null, _.bind(options.inverse, null, {}))
    });

    return "<div id='" + id +
      "'><!-- for replacement with findlive each --></div>";
  };
};

// XXX namespacing
Sky._partials = {};

// XXX hack: name may be null, in which case nothing is put in
// Template, there is no way to define events/data functions, and
// the finished template function (that would otherwise be put in
// Template) is returned. this is a hack that is used for <body>
// templates.
Sky._def_template = function (name, raw_func) {
  Sky._hook_handlebars_each();
  window.Template = window.Template || {};
  var cooked_func = function (data) {
    var in_partial = !!Sky._pending_partials;
    if (!in_partial)
      Sky._pending_partials = {};

//    try { XXX NOCOMMIT COMMENT???
      var html = raw_func(data, {
        helpers: name ? Template[name] : {},
        partials: Sky._partials
      });
/*    } catch (e) {
      if (!in_partial)
        Sky._pending_partials = null;
      throw e;
    } */

    // XXX see the 'clean' function in jquery for a much more
    // elaborate implementation of this. it's smart about
    // instantiating, eg, a tr inside a table, not directly inside
    // a div. we probably need to do that..
    var div = document.createElement("div");
    div.innerHTML = html;
    var frag = document.createDocumentFragment();
    while (div.firstChild)
      frag.appendChild(div.firstChild);

    if (!in_partial) {
      var traverse = function (elt) {
        for (var i = 0; i < elt.childNodes.length; i++) {
          var child = elt.childNodes[i];
          var replacement = child.id && Sky._pending_partials[child.id];
          if (replacement) {
            var range = new Sky.ui._LiveRange(Sky.ui._tag, child);
            range.replace_contents(replacement);
            range.destroy();
            delete Sky._pending_partials[child.id];
            i--;
            continue;
          }
          traverse(child);
        }
      };

      traverse(frag);

      for (var id in Sky._pending_partials)
        throw new Error("internal error -- not all pending partials patched");
      Sky._pending_partials = null;
    }

    return frag;
  };

  var func = function (data) {
    return Sky.ui.render(_.bind(cooked_func, null, data),
                         name && Template[name].events || {}, data);
  };

  if (name) {
    if (Template[name])
      throw new Error("There are multiple templates named '" + name +
                      "'. Each template needs a unique name.");

    Template[name] = func;

    // XXX hack.. copy all of Handlebars' built in helpers over to
    // Template.foo. it would be better to hook helperMissing (or
    // something like that?) so that Template.foo is searched only
    // if it's not a built-in helper.
    _.extend(Template[name], Handlebars.helpers);
  }

  // XXX hacky. sucks that we have to depend on handlebars here.
  if (name) {
    Sky._partials[name] = function (data) {
      if (!Sky._pending_partials)
        // XXX lame error
        throw new Error("this partial may only be invoked from inside a Template.foo-style template");
      var frag = func(data);
      var id = Sky._pending_partials_idx_nonce++;
      Sky._pending_partials[id] = frag;
      return "<div id='" + id + "'><!-- for replacement with partial --></div>";
    };
  }

  if (!name)
    return func;
};
