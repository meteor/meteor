// XXX ugly hack. provides Sky._def_template, which is used to load in
// compiled templates.

// XXX disgusting hack. we want to allow Template.foo to be used as a
// Handlebars partial. uh oh -- Handlebars does templating in the
// realm of strings, but Template.foo returns a DOM element (it must,
// for event handlers to work properly). so, for now, we make the
// partial render as an empty div and fix it up later. this probably
// doesn't work in some cases, such as inside a table or ul, where
// divs don't go. this also breaks the ability to have a partial that
// isn't a single DOM element (eg, a partial that is a set of
// attributes, or a text string to be included inside an attribute..)

// XXX it'd be nice to do a better job of hiding this symbol
Sky._pending_partials = null; // id -> element

// XXX another disgusting hack -- we reach into handlebars and
// extend #each to know how to cooperate with pending_partials and
// minimongo findlive.
//
// XXX XXX XXX the garbage collection implications are terrible.. we
// don't even pretend to call stop on the findlive, so every time
// we're rerendered, we kick off another findlive that runs
// .. forever!
Sky._hook_handlebars_each = function () {
  Sky._hook_handlebars_each = function(){}; // install the hook only once

  var orig = Handlebars._default_helpers.each;
  Handlebars._default_helpers.each = function (context, options) {
    if (!(context instanceof Collection.LiveResultsSet))
      return orig(context, options);

    // XXX inserts an intermediate DIV!! that is lame and should be
    // fixed. besides general hygiene/pride, we really need to
    // support <ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul>
    var element = document.createElement("div");

    var trim = function (markup) {
      // Consider {{#each items}\n{{> item}}\n{{/each}}
      //
      // In that case, options.fn will return HTML that parses into
      // three nodes: whitespace, the partial, whitespace. That
      // won't work. I can't reconcile this logically at the moment,
      // but "do what you mean" and strip the whitespace.
      //
      // XXX fails if a {{#if}..{{else}}..{{/if}} is at toplevel in
      // a template?
      var match = markup.match(/^\s*(<[\s\S]+>)\s*$/);
      if (match)
        markup = match[1];
      return markup;
    }

    var render = Sky._def_template(null, function (obj) {
      return trim(options.fn(obj));
    });

    var renderElse = Sky._def_template(null, function () {
      return trim(options.inverse({}));
    });

    // XXX sort of lame that we always end up rendering this even if
    // the query returns results 100% of the time ..
    var is_empty = true;
    element.appendChild(renderElse());

    // XXX copied code from Sky.ui.renderList.. bleh
    // (with addition of is_empty / renderElse)
    context.reconnect({
      added: function (obj, before_idx) {
        if (is_empty) {
          element.removeChild(element.childNodes[0]);
          is_empty = false;
        }
        if (before_idx === element.childNodes.length)
          element.appendChild(render(obj));
        else
          element.insertBefore(render(obj), element.childNodes[before_idx]);
        Sky.ui._tryFocus();
      },
      removed: function (id, at_idx) {
        element.removeChild(element.childNodes[at_idx]);
        if (element.childNodes.length === 0) {
          is_empty = true;
          element.appendChild(renderElse());
        }
      },
      changed: function (obj, at_idx) {
        element.insertBefore(render(obj), element.childNodes[at_idx]);
        element.removeChild(element.childNodes[at_idx + 1]);
        Sky.ui._tryFocus();
      },
      moved: function (obj, old_idx, new_idx) {
        var elt = element.removeChild(element.childNodes[old_idx]);
        if (new_idx === element.childNodes.length)
          element.appendChild(elt);
        else
          element.insertBefore(elt, element.childNodes[new_idx]);
      }
    });

    var id = Sky.genId();
    Sky._pending_partials[id] = element;
    return "<div id='" + id +
      "'><!-- for replacement with findlive each --></div>";
  }
};

// XXX namespacing
Sky._partials = {};

// XXX hack: name may be null, in which case nothing is put in
// Template, there is no way to define events/data functions, and
// the finished template function (that would otherwise be put in
// Template) is returned. this is a hack that is used for <body>
// templates.
//
// XXX hack: if multi is true, the template is allowed to return
// multiple elemnts at toplevel, and the return value of the created
// template function is a list. this is used for <body>.
Sky._def_template = function (name, raw_func, multi) {
  Sky._hook_handlebars_each();
  window.Template = window.Template || {};
  var cooked_func = function (data) {
    var in_partial = !!Sky._pending_partials;
    if (!in_partial)
      Sky._pending_partials = {};
    // XXX should catch exceptions and clean up pending_partials if
    // stack is unwound
    var html = raw_func(data, {
      helpers: name ? Template[name] : {},
      partials: Sky._partials
    });

    if (html === '')
      html = ' '; // ensure at least one node is generated ..

    // XXX see the 'clean' function in jquery for a much more
    // elaborate implementation of this. it's smart about
    // instantiating, eg, a tr inside a table, not directly inside
    // a div. we probably need to do that..
    var div = document.createElement("div");
    div.innerHTML = html;
    if (div.childNodes.length !== 1 && !multi)
      // XXX this limitation is really lame and possibly
      // unsustainable.. on the other hand .. what, you want
      // Template.foo to return an array? (maybe a jquery object?)
      throw new Error("A template should return exactly 1 node, but " +
                      (name ? name : "(anonymous template)") +
                      " returned " + div.childNodes.length)

    if (!in_partial) {
      // make multiple passes, since partials could be nested.
      // XXX inefficient
      do {
        var replaced = [];
        for (var id in Sky._pending_partials) {
          // XXX jquery dependency
          var target = $("#" + id, div)[0];
          if (target) {
            $(target).replaceWith(Sky._pending_partials[id]);
            replaced.push(id);
          }
        }
        replaced.forEach(function (id) {
          delete Sky._pending_partials[id];
        });
      } while (replaced.length);
      for (var id in Sky._pending_partials)
        throw new Error("internal error -- not all pending partials patched");
      Sky._pending_partials = null;
    }

    if (!multi)
      return div.childNodes[0];
    else {
      // make DOM node list into a proper JS array
      var ret = [];
      for (var i = 0; i < div.childNodes.length; i++)
        ret.push(div.childNodes[i]);
      return ret;
    }
  };

  var func = function (data) {
    return Sky.ui.render(_.bind(cooked_func, null, data),
                         name && Template[name].events || {}, data);
  };

  if (name) {
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
      var elt = func(data);
      var id = Sky.genId();
      Sky._pending_partials[id] = elt;
      return "<div id='" + id + "'><!-- for replacement with partial --></div>";
    };
  }

  if (!name)
    return func;
};
