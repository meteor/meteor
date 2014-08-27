Template.headline.release = function () {
  return Meteor.release ? "0.9.0" : "(checkout)";

};

Meteor.startup(function () {
  // XXX this is broken by the new multi-page layout.  Also, it was
  // broken before the multi-page layout because it had illegible
  // colors. Just turn it off for now. We'll fix it and turn it on
  // later.
  // prettyPrint();

  //mixpanel tracking
  mixpanel.track('docs');

  // returns a jQuery object suitable for setting scrollTop to
  // scroll the page, either directly for via animate()
  var scroller = function() {
    return $("html, body").stop();
  };

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
  var section = document.location.hash.substr(1) || sections[0].id;
  Session.set('section', section);
  if (section) {
    // WebKit will scroll down to the #id in the URL asynchronously
    // after the page is rendered, but Firefox won't.
    Meteor.setTimeout(function() {
      var elem = $('#'+section);
      if (elem.length)
        scroller().scrollTop(elem.offset().top);
    }, 0);
  }

  var ignore_waypoints = false;
  var lastTimeout = null;
  $('h1, h2, h3').waypoint(function (evt, dir) {
    if (!ignore_waypoints) {
      var active = (dir === "up") ? this.prev : this;
      if (active.id) {
        if (lastTimeout)
          Meteor.clearTimeout(lastTimeout);
        lastTimeout = Meteor.setTimeout(function () {
          Session.set("section", active.id);
        }, 200);
      }
    }
  });

  window.onhashchange = function () {
    scrollToSection(location.hash);
  };

  var scrollToSection = function (section) {
    if (! $(section).length)
      return;

    ignore_waypoints = true;
    Session.set("section", section.substr(1));
    scroller().animate({
      scrollTop: $(section).offset().top
    }, 500, 'swing', function () {
      window.location.hash = section;
      ignore_waypoints = false;
    });
  };

  $('#main, #nav').delegate("a[href^='#']", 'click', function (evt) {
    evt.preventDefault();
    var sel = $(this).attr('href');
    scrollToSection(sel);

    mixpanel.track('docs_navigate_' + sel);
  });

  // Make external links open in a new tab.
  $('a:not([href^="#"])').attr('target', '_blank');

  // Hide menu by tapping on background
  $('#main').on('click', function () {
    hideMenu();
  });
});

var hideMenu = function () {
  $('#nav').removeClass('show');
  $('#menu-ico').removeClass('hidden');
};

var t = function (name, id, instance) {
  if (! id) {
    id = idForLongname(name);
  }

  return {
    name: name,
    id: id,
    instance: instance
  };
};

var instance = function (longname) {
  var data = apiData(longname);

  return {
    name: data.name,
    id: idForLongname(longname),
    instance: apiData(data.memberof).instancename
  };
};

var spacer = function () {
  return {type: "spacer"};
};

var toc = [
  {name: "Meteor " + Template.headline.release(), id: "top"}, [
    "Quick start",
    "Seven principles",
    "Resources"
  ],

  "Concepts", [
    "What is Meteor?",
    "Structuring your app",
    "Data and security",
    "Reactivity",
    "Live HTML templates",
    "Using packages",
    "Namespacing",
    "Deploying",
    "Writing packages"
  ],

  "API", [
    "Core", [
      t("Meteor.isClient"),
      t("Meteor.isServer"),
      t("Meteor.startup"),
      t("Meteor.absoluteUrl"),
      t("Meteor.settings"),
      t("Meteor.release")
    ],

    "Publish and subscribe", [
      t("Meteor.publish"),
      [
        instance("Subscription#userId"),
        instance("Subscription#added"),
        instance("Subscription#changed"),
        instance("Subscription#removed"),
        instance("Subscription#ready"),
        instance("Subscription#onStop"),
        instance("Subscription#error"),
        instance("Subscription#stop"),
        instance("Subscription#connection")
      ],
      "Meteor.subscribe"
    ],

    t("Methods", "methods_header"), [
      t("Meteor.methods"),
      [
        instance("MethodInvocation#userId"),
        instance("MethodInvocation#setUserId"),
        instance("MethodInvocation#isSimulation"),
        instance("MethodInvocation#unblock"),
        instance("MethodInvocation#connection")
      ],
      t("Meteor.Error"),
      "Meteor.call",
      "Meteor.apply"
    ],

    t("Server connections", "connections"), [
      t("Meteor.status"),
      t("Meteor.reconnect"),
      t("Meteor.disconnect"),
      t("Meteor.onConnection"),
      t("DDP.connect")
    ],

    t("Collections", "collections"), [
      t("Meteor.Collection"), [
        instance("Meteor.Collection#find"),
        instance("Meteor.Collection#findOne"),
        instance("Meteor.Collection#insert"),
        instance("Meteor.Collection#update"),
        instance("Meteor.Collection#upsert"),
        instance("Meteor.Collection#remove"),
        instance("Meteor.Collection#allow"),
        instance("Meteor.Collection#deny")
      ],

      "Meteor.Collection.Cursor", [
        instance("Meteor.Collection.Cursor#forEach"),
        instance("Meteor.Collection.Cursor#map"),
        instance("Meteor.Collection.Cursor#fetch"),
        instance("Meteor.Collection.Cursor#count"),
        instance("Meteor.Collection.Cursor#observe"),
        instance("Meteor.Collection.Cursor#observeChanges")
      ],
      spacer(),
      t("Meteor.Collection.ObjectID"),
      spacer(),

      {name: "Selectors", style: "noncode"},
      {name: "Modifiers", style: "noncode"},
      {name: "Sort specifiers", style: "noncode"},
      {name: "Field specifiers", style: "noncode"}
    ],

    "Session", [
      t("Session.set"),
      t("Session.setDefault"),
      t("Session.get"),
      t("Session.equals")
    ],

    t("Accounts", "accounts_api"), [
      t("Meteor.user"),
      t("Meteor.userId"),
      t("Meteor.users"),
      t("Meteor.loggingIn"),
      t("Meteor.logout"),
      t("Meteor.logoutOtherClients"),
      t("Meteor.loginWithPassword"),
      t("Meteor.loginWith<Service>", "meteor_loginwithexternalservice"),
      spacer(),

      t("{{currentUser}}", "template_currentuser"),
      t("{{loggingIn}}", "template_loggingin"),
      spacer(),

      t("Accounts.config"),
      t("Accounts.ui.config"),
      t("Accounts.validateNewUser"),
      t("Accounts.onCreateUser"),
      t("Accounts.validateLoginAttempt"),
      t("Accounts.onLogin"),
      t("Accounts.onLoginFailure", "accounts_onlogin")
    ],

    t("Passwords", "accounts_passwords"), [
      t("Accounts.createUser"),
      t("Accounts.changePassword"),
      t("Accounts.forgotPassword"),
      t("Accounts.resetPassword"),
      t("Accounts.setPassword"),
      t("Accounts.verifyEmail"),
      spacer(),

      t("Accounts.sendResetPasswordEmail"),
      t("Accounts.sendEnrollmentEmail"),
      t("Accounts.sendVerificationEmail"),
      t("Accounts.emailTemplates")
    ],

    // template stuff is not migrated to new docs yet
    t("Templates", "templates_api"), [
      {prefix: "Template", instance: "myTemplate", id: "templates_api"}, [
        t("events", "Template-events"),
        t("helpers", "Template-helpers"),
        {name: "rendered", id: "template_rendered"},
        {name: "created", id: "template_created"},
        {name: "destroyed", id: "template_destroyed"}
      ],
      {name: "Template instances", id: "template_inst"}, [
        {instance: "this", name: "findAll", id: "template_findAll"},
        {instance: "this", name: "$", id: "template_findAll"},
        {instance: "this", name: "find", id: "template_find"},
        {instance: "this", name: "firstNode", id: "template_firstNode"},
        {instance: "this", name: "lastNode", id: "template_lastNode"},
        {instance: "this", name: "data", id: "template_data"},
        {instance: "this", name: "autorun", id: "template_autorun"}
      ],
      "UI", [
        "UI.registerHelper",
        "UI.body",
        "UI.render",
        "UI.renderWithData",
        "UI.insert",
        "UI.remove",
        "UI.getElementData",
        {name: "{{> UI.dynamic}}", id: "ui_dynamic"}
      ],
      {type: "spacer"},
      {name: "Event maps", style: "noncode"}
     ],

    // Match is not migrated to new docs yet
    "Match", [
      "check",
      "Match.test",
      {name: "Match patterns", style: "noncode"}
    ],

    "Timers", [
      t("Meteor.setTimeout"),
      t("Meteor.setInterval"),
      t("Meteor.clearTimeout"),
      t("Meteor.clearInterval")
    ],

    "Deps", [
      t("Deps.autorun"),
      t("Deps.flush"),
      t("Deps.nonreactive"),
      t("Deps.active"),
      t("Deps.currentComputation"),
      t("Deps.onInvalidate"),
      t("Deps.afterFlush"),
      "Deps.Computation", [
        instance("Deps.Computation#stop"),
        instance("Deps.Computation#invalidate"),
        instance("Deps.Computation#onInvalidate"),
        instance("Deps.Computation#stopped"),
        instance("Deps.Computation#invalidated"),
        instance("Deps.Computation#firstRun")
      ],
      "Deps.Dependency", [
        instance("Deps.Dependency#changed"),
        instance("Deps.Dependency#depend"),
        instance("Deps.Dependency#hasDependents")
      ]
    ],

    // "Environment Variables", [
    //   "Meteor.EnvironmentVariable", [
    //     {instance: "env_var", name: "get", id: "env_var_get"},
    //     {instance: "env_var", name: "withValue", id: "env_var_withvalue"},
    //     {instance: "env_var", name: "bindEnvironment", id: "env_var_bindenvironment"}
    //   ]
    //],

    {name: "EJSON", id: "ejson"}, [
      t("EJSON.parse"),
      t("EJSON.stringify"),
      t("EJSON.fromJSONValue"),
      t("EJSON.toJSONValue"),
      t("EJSON.equals"),
      t("EJSON.clone"),
      t("EJSON.newBinary"),
      t("EJSON.isBinary"),
      t("EJSON.addType"),

      // EJSON instances not yet migrated
      [
        {instance: "instance", id: "ejson_type_typeName", name: "typeName"},
        {instance: "instance", id: "ejson_type_toJSONValue", name: "toJSONValue"},
        {instance: "instance", id: "ejson_type_clone", name: "clone"},
        {instance: "instance", id: "ejson_type_equals", name: "equals"}
      ]
    ],


    "HTTP", [
      t("HTTP.call"),
      {name: "HTTP.get"},
      {name: "HTTP.post"},
      {name: "HTTP.put"},
      {name: "HTTP.del"}
    ],
    "Email", [
      "Email.send"
    ],
    {name: "Assets", id: "assets"}, [
      {name: "Assets.getText", id: "assets_getText"},
      {name: "Assets.getBinary", id: "assets_getBinary"}
    ],

    {name: "Package.js", id: "packagejs"}, [
      {name: "Package.describe", id: "packagedescription"},
      {name: "Package.onUse", id: "packagedefinition"}, [
        {name: "api.versionsFrom", id: "pack_versions"},
        {name: "api.use", id: "pack_use"},
        {name: "api.imply", id: "pack_api_imply"},
        {name: "api.export", id: "pack_export"},
        {name: "api.addFiles", id: "pack_addFiles"}
      ],
      {name: "Package.onTest", id: "packagetests"}
    ]
  ],

  "Packages", [ [
    "accounts-ui",
    "amplify",
    "appcache",
    "audit-argument-checks",
    "backbone",
    "bootstrap",
    "browser-policy",
    "coffeescript",
    "d3",
    "force-ssl",
    "jquery",
    "less",
    "oauth-encryption",
    "random",
    "spiderable",
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
    "meteor bundle",
    "meteor search",
    "meteor show",
    "meteor publish",
    "meteor publish-for-arch",
    "meteor publish-release",
    "meteor test-packages",
    "meteor admin"
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
      // Work around (eg) accidental trailing commas leading to spurious holes
      // in IE8.
      if (!item)
        return;
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
};

Template.nav.maybe_current = function () {
  return Session.equals("section", this.id) ? "current" : "";
};

Template.nav_section.depthIs = function (n) {
  return this.depth === n;
};

// Show hidden TOC when menu icon is tapped
Template.nav.events({
  'click #menu-ico' : function () {
    $('#nav').addClass('show');
    $('#menu-ico').addClass('hidden');
  },
  // Hide TOC when selecting an item
  'click a' : function () {
    hideMenu();
  }
});

UI.registerHelper('dstache', function() {
  return '{{';
});

UI.registerHelper('tstache', function() {
  return '{{{';
});

UI.registerHelper('lt', function () {
  return '<';
});

Template.api_box.bare = function() {
  return ((this.descr && this.descr.length) ||
          (this.args && this.args.length) ||
          (this.options && this.options.length)) ? "" : "bareapi";
};

check_links = function() {
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

var canonicalize = function (id) {
  return id.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
};

// better suggestions
check_links_migrate = function() {
  var body = document.body.innerHTML;

  var id_set = {};
  var suggDict = {};

  body.replace(/id\s*=\s*"(.*?)"/g, function(match, id) {
    if (! id) return;
    if (id_set['$'+id]) {
      console.log("ERROR: Duplicate id: "+id);
    } else {
      id_set['$'+id] = canonicalize(id);
    }
  });

  body.replace(/"#(.*?)"/g, function(match, frag) {
    if (! frag) return;
    if (! id_set['$'+frag]) {
      var suggestions = [];

      _.each(id_set, function(canonicalized, id) {
        id = id.slice(1);

        if (canonicalized.indexOf(canonicalize(frag)) !== -1) {
          suggestions.push(id);
        }
      });

      suggDict[frag] = suggestions;
    }
  });

  console.log(JSON.stringify(suggDict));

  return "DONE";
};
