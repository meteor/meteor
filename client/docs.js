Meteor.startup(function () {
  var layout = $('body').layout({west: {size: 300}});
  // XXX this is broken by the new multi-page layout.  Also, it was
  // broken before the multi-page layout because it had illegible
  // colors. Just turn it off for now. We'll fix it and turn it on
  // later.
  // prettyPrint();

  var sections = $('#main h1, #main h2, #main h3');
  for (var i = 0; i < sections.length; i++) {
    sections[i].prev = sections[i-1] || sections[i];
    sections[i].next = sections[i+1] || sections[i];
    $(sections[i]).waypoint({context: '#main', offset: 30});
  }
  Session.set('section', document.location.hash.substr(1) || sections[0].id);

  var ignore_waypoints = false;
  $('body').delegate('h1, h2, h3', 'waypoint.reached', function (evt, dir) {
    if (!ignore_waypoints) {
      var active = (dir === "up") ? this.prev : this;
      Session.set("section", active.id);
    }
  });

  $('body').delegate("a[href^='#']", 'click', function (evt) {
    evt.preventDefault();
    var sel = $(this).attr('href');
    ignore_waypoints = true;
    Session.set("section", sel.substr(1));
    $('#main').stop().animate({
      scrollTop: $(sel).offset().top + $('#main').scrollTop()
    }, 500, 'swing', function () {
      window.location.hash = sel;
      ignore_waypoints = false;
    });
  });
});

var toc = [
  "Introduction", [
    "Quick start",
    "Seven principles",
    "Resources"
  ],
  "Examples", [
    "Leaderboard",
    "Todos"
  ],
  "Concepts", [
    "Structuring your application",
    "Data",
    "Reactivity",
    "Templates",
    "Smart Packages",
    "Deploying",
  ],
  "API", [
    "Meteor", [
      "publish",
      "subscribe",
      "autosubscribe",
      "is_client, is_server",
      "startup",
      "flush",
      "status",
      "reconnect"
    ],
    "Collection", [
      {name: "Meteor.Collection", id: "create_collection"},
      "find",
      "cursor.count",
      "cursor.foreach",
      "cursor.map",
      "cursor.fetch",
      "cursor.rewind",
      "cursor.observe",
      "insert",
      "update",
      "remove",
      {type: "spacer"},
      {name: "Selectors", style: "noncode"},
      {name: "Modifiers", style: "noncode"},
      {name: "Sort specifiers", style: "noncode"}
    ],
    "Session", [
      "set",
      "get",
      "equals"
    ],
    "Meteor.ui", [
      "render",
      "renderList",
      {type: "spacer"},
      {name: "Event maps", style: "noncode"}
    ],
    "Meteor.deps", [
      {name: "Meteor.deps.Context", id: "context"},
      {name: "Meteor.deps.Context.current", id: "current"},
      {type: "spacer"},
      "run",
      {name: "on_invalidate", id: "on_invalidate"},
      "invalidate",
    ],
    "Command line", [
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
    ]
  ],
  {name: "Packages", id: "packagelist"}, [
    "amplify",
    "backbone",
    "coffeescript",
    "jquery",
    "less",
    "showdown",
    "underscore"
  ]
];

var name_to_id = function (name) {
  var x = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
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
