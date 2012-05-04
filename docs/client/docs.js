METEOR_VERSION = "0.3.5";

Meteor.startup(function () {
  // XXX this is broken by the new multi-page layout.  Also, it was
  // broken before the multi-page layout because it had illegible
  // colors. Just turn it off for now. We'll fix it and turn it on
  // later.
  // prettyPrint();

  var sections = [];
  _.each($('#main h1, #main h2, #main h3'), function (elt) {
    var classes = (elt.getAttribute('class') || '').split(/\s+/);
    if (_.indexOf(classes, "nosection") === -1)
      sections.push(elt);
  });

  for (var i = 0; i < sections.length; i++) {
    var classes = (sections[i].getAttribute('class') || '').split(/\s+/);
    if (_.indexOf(classes, "nosection") !== -1)
      continue;
    sections[i].prev = sections[i-1] || sections[i];
    sections[i].next = sections[i+1] || sections[i];
    $(sections[i]).waypoint({offset: 30});
  }
  Session.set('section', document.location.hash.substr(1) || sections[0].id);

  var ignore_waypoints = false;
  $('body').delegate('h1, h2, h3', 'waypoint.reached', function (evt, dir) {
    if (!ignore_waypoints) {
      var active = (dir === "up") ? this.prev : this;
      Session.set("section", active.id);
    }
  });

  $('#main, #nav').delegate("a[href^='#']", 'click', function (evt) {
    evt.preventDefault();
    var sel = $(this).attr('href');
    ignore_waypoints = true;
    Session.set("section", sel.substr(1));
    $('body').stop().animate({
      scrollTop: $(sel).offset().top
    }, 500, 'swing', function () {
      window.location.hash = sel;
      ignore_waypoints = false;
    });
  });
});

var toc = [
  {name: "Meteor " + METEOR_VERSION, id: "top"}, [
    "Quick start",
    "Seven principles",
    "Resources"
  ],
  "Concepts", [
    "Structuring your app",
    "Data",
    "Reactivity",
    "Live HTML",
    "Templates",
    "Smart Packages",
    "Deploying"
  ],

  "API", [
    "Core", [
      "Meteor.is_client",
      "Meteor.is_server",
      "Meteor.startup"
    ],

    "Publish and subscribe", [
      "Meteor.publish", [
        {instance: "this", name: "set", id: "publish_set"},
        {instance: "this", name: "unset", id: "publish_unset"},
        {instance: "this", name: "complete", id: "publish_complete"},
        {instance: "this", name: "flush", id: "publish_flush"},
        {instance: "this", name: "onStop", id: "publish_onstop"},
        {instance: "this", name: "stop", id: "publish_stop"}
      ],
      "Meteor.subscribe",
      "Meteor.autosubscribe"
    ],

    {name: "Methods", id: "methods_header"}, [
      "Meteor.methods", [
        {instance: "this", name: "is_simulation", id: "method_is_simulation"},
        {instance: "this", name: "unblock", id: "method_unblock"}
      ],
      "Meteor.Error",
      "Meteor.call",
      "Meteor.apply"
    ],

    {name: "Server connections", id: "connections"}, [
      "Meteor.status",
      "Meteor.reconnect",
      "Meteor.connect"
    ],

    {name: "Collections", id: "collections"}, [
      "Meteor.Collection", [
        {instance: "collection", name: "find"},
        {instance: "collection", name: "findOne"},
        {instance: "collection", name: "insert"},
        {instance: "collection", name: "update"},
        {instance: "collection", name: "remove"}
      ],

      "Meteor.Collection.Cursor", [
        {instance: "cursor", name: "forEach"},
        {instance: "cursor", name: "map"},
        {instance: "cursor", name: "fetch"},
        {instance: "cursor", name: "count"},
        {instance: "cursor", name: "rewind"},
        {instance: "cursor", name: "observe"}
      ],
      {type: "spacer"},
      {name: "Selectors", style: "noncode"},
      {name: "Modifiers", style: "noncode"},
      {name: "Sort specifiers", style: "noncode"}
    ],

    "Session", [
      "Session.set",
      "Session.get",
      "Session.equals"
    ],

    "Meteor.ui", [
      "Meteor.ui.render",
      "Meteor.ui.chunk",
      "Meteor.ui.listChunk",
      "Meteor.flush",
      {type: "spacer"},
      {name: "Event maps", style: "noncode"}
    ],

    "Timers", [
      "Meteor.setTimeout",
      "Meteor.setInterval",
      "Meteor.clearTimeout",
      "Meteor.clearInterval"
    ],

    "Meteor.deps", [
      {name: "Meteor.deps.Context", id: "context"}, [
        {instance: "context", name: "run"},
        {instance: "context", name: "on_invalidate"},
        {instance: "context", name: "invalidate"}
      ],
      {name: "Meteor.deps.Context.current", id: "current"}
    // ],

    // "Environment Variables", [
    //   "Meteor.EnvironmentVariable", [
    //     {instance: "env_var", name: "get", id: "env_var_get"},
    //     {instance: "env_var", name: "withValue", id: "env_var_withvalue"},
    //     {instance: "env_var", name: "bindEnvironment", id: "env_var_bindenvironment"}
    //   ]
    ],

    "Meteor.http", [
      "Meteor.http.call",
      {name: "Meteor.http.get", id: "meteor_http_get"},
      {name: "Meteor.http.post", id: "meteor_http_post"},
      {name: "Meteor.http.put", id: "meteor_http_put"},
      {name: "Meteor.http.del", id: "meteor_http_del"}
    ]
  ],

  "Packages", [ [
    "amplify",
    "backbone",
    "bootstrap",
    "coffeescript",
    "jquery",
    "less",
    "sass",
    "stylus",
    "showdown",
    "underscore"
  ] ],

  "Command line", [ [
    "meteor help",
    "meteor run",
    "meteor create",
    "meteor deploy",
    "meteor logs",
    "meteor update",
    "meteor add",
    "meteor remove",
    "meteor list",
    "meteor mongo",
    "meteor reset",
    "meteor bundle"
  ] ]
];

var name_to_id = function (name) {
  var x = name.toLowerCase().replace(/[^a-z0-9_,.]/g, '').replace(/[,.]/g, '_');
  return x;
};

Template.nav.sections = function () {
  var ret = [];
  var walk = function (items, depth) {
    _.each(items, function (item) {
      if (item instanceof Array)
        walk(item, depth + 1);
      else {
        if (typeof(item) === "string")
          item = {name: item};
        ret.push(_.extend({
          type: "section",
          id: item.name && name_to_id(item.name) || undefined,
          depth: depth,
          style: ''
        }, item));
      }
    });
  };

  walk(toc, 1);
  return ret;
};

Template.nav.type = function (what) {
  return this.type === what;
}

Template.nav.maybe_current = function () {
  return Session.equals("section", this.id) ? "current" : "";
};

Handlebars.registerHelper('warning', function(fn) {
  return Template.warning_helper(fn(this));
});

Handlebars.registerHelper('note', function(fn) {
  return Template.note_helper(fn(this));
});

Handlebars.registerHelper('dtdd', function(name, optType, fn) {
  var type = null;
  // handle optional positional argument (messy)
  if (! fn)
    fn = optType; // two arguments
  else
    type = optType; // three arguments

  return Template.dtdd_helper(
    {descr: fn(this), name:name, type:type}, true);
});

Handlebars.registerHelper('better_markdown', function(fn) {
  var converter = new Showdown.converter();
  var input = fn(this);

  ///////
  // Make Markdown *actually* skip over block-level elements when
  // processing a string.
  //
  // Official Markdown doesn't descend into
  // block elements written out as HTML (divs, tables, etc.), BUT
  // it doesn't skip them properly either.  It assumes they are
  // either pretty-printed with their contents indented, or, failing
  // that, it just scans for a close tag with the same name, and takes
  // it regardless of whether it is the right one.  As a hack to work
  // around Markdown's hacks, we find the block-level elements
  // using a proper recursive method and rewrite them to be indented
  // with the final close tag on its own line.
  ///////

  // Open-block tag should be at beginning of line,
  // and not, say, in a string literal in example code, or in a pre block.
  // Tag must be followed by a non-word-char so that we match whole tag, not
  // eg P for PRE.  All regexes we wish to use when scanning must have
  // 'g' flag so that they respect (and set) lastIndex.
  // Assume all tags are lowercase.
  var rOpenBlockTag = /^\s{0,2}<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del)(?=\W)/mg;
  var rTag = /<(\/?\w+)/g;
  var idx = 0;
  var newParts = [];
  var blockBuf = [];
  // helper function to execute regex `r` starting at idx and putting
  // the end index back into idx; accumulate the intervening string
  // into an array; and return the regex's first capturing group.
  var rcall = function(r, inBlock) {
    var lastIndex = idx;
    r.lastIndex = lastIndex;
    var match = r.exec(input);
    var result = null;
    if (! match) {
      idx = input.length;
    } else {
      idx = r.lastIndex;
      result = match[1];
    }
    (inBlock ? blockBuf : newParts).push(input.substring(lastIndex, idx));
    return result;
  };

  var nestedTags = [];
  while (idx < input.length) {
    var blockTag = rcall(rOpenBlockTag, false);
    if (blockTag) {
      nestedTags.push(blockTag);
      while (nestedTags.length) {
        var tag = rcall(rTag, true);
        if (! tag) {
          throw new Error("Expected </"+nestedTags[nestedTags.length-1]+
                          "> but found end of string");
        } else if (tag.charAt(0) === '/') {
          // close tag
          var tagToPop = tag.substring(1);
          var tagPopped = nestedTags.pop();
          if (tagPopped !== tagToPop)
            throw new Error(("Mismatched close tag, expected </"+tagPopped+
                             "> but found </"+tagToPop+">: "+
                             input.substr(idx-50,50)+"{HERE}"+
                             input.substr(idx,50)).replace(/\n/g,'\\n'));
        } else {
          // open tag
          nestedTags.push(tag);
        }
      }
      var newBlock = blockBuf.join('');
      var closeTagLoc = newBlock.lastIndexOf('<');
      var firstMatchingClose = newBlock.indexOf('</'+blockTag+'>');
      var shouldIndent =
            (firstMatchingClose >= 0 && firstMatchingClose < closeTagLoc);
      // Put final close tag at beginning of line, indent other lines if necessary.
      // Not indenting unless necessary saves us from indenting in a <pre> tag.
      var part1 = newBlock.substring(0, closeTagLoc);
      var part2 = newBlock.substring(closeTagLoc);
      if (shouldIndent)
        part1 = part1.replace(/\n/g, '\n  ');
      newBlock = part1 + '\n' + part2;
      newParts.push(newBlock);
      blockBuf.length = 0;
    }
  }

  var newInput = newParts.join('');
  var output = converter.makeHtml(newInput);
  return output;
});

Handlebars.registerHelper('dstache', function() {
  return '{{';
});

Handlebars.registerHelper('tstache', function() {
  return '{{{';
});

Handlebars.registerHelper('api_section', function(id, nameFn) {
  return Template.api_section_helper(
    {name: nameFn(this), id:id}, true);
});

Handlebars.registerHelper('api_box_inline', function(box, fn) {
  return Template.api_box(_.extend(box, {body: fn(this)}), true);
});

Template.api_box.bare = function() {
  return ((this.descr && this.descr.length) ||
          (this.args && this.args.length) ||
          (this.options && this.options.length)) ? "" : "bareapi";
};

var check_links = function() {
  var body = document.body.innerHTML;

  var id_set = {};

  body.replace(/id\s*=\s*"(.*?)"/g, function(match, id) {
    if (! id) return;
    if (id_set['$'+id]) {
      console.log("ERROR: Duplicate id: "+id);
    } else {
      id_set['$'+id] = true;
    }
  });

  body.replace(/"#(.*?)"/g, function(match, frag) {
    if (! frag) return;
    if (! id_set['$'+frag]) {
      var suggestions = [];
      _.each(_.keys(id_set), function(id) {
        id = id.slice(1);
        if (id.slice(-frag.length) === frag ||
            frag.slice(-id.length) === id) {
          suggestions.push(id);
        }
      });
      var msg = "ERROR: id not found: "+frag;
      if (suggestions.length > 0) {
        msg += " -- suggest "+suggestions.join(', ');
      }
      console.log(msg);
    }
  });

  return "DONE";
};
