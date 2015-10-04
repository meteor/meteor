var toc = [
  [
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
      "Meteor.isClient",
      "Meteor.isServer",
      "Meteor.isCordova",
      "Meteor.startup",
      "Meteor.wrapAsync",
      "Meteor.absoluteUrl",
      "Meteor.settings",
      "Meteor.release"
    ],

    "Publish and subscribe", [
      "Meteor.publish", [
        {instance: "this", name: "userId", id: "publish_userId"},
        {instance: "this", name: "added", id: "publish_added"},
        {instance: "this", name: "changed", id: "publish_changed"},
        {instance: "this", name: "removed", id: "publish_removed"},
        {instance: "this", name: "ready", id: "publish_ready"},
        {instance: "this", name: "onStop", id: "publish_onstop"},
        {instance: "this", name: "error", id: "publish_error"},
        {instance: "this", name: "stop", id: "publish_stop"},
        {instance: "this", name: "connection", id: "publish_connection"}
      ],
      "Meteor.subscribe",
      {name: "DDPRateLimiter", id: "ddpratelimiter"}
    ],

    {name: "Methods", id: "methods_header"}, [
      "Meteor.methods", [
        {instance: "this", name: "userId", id: "method_userId"},
        {instance: "this", name: "setUserId", id: "method_setUserId"},
        {instance: "this", name: "isSimulation", id: "method_issimulation"},
        {instance: "this", name: "unblock", id: "method_unblock"},
        {instance: "this", name: "connection", id: "method_connection"}
      ],
      "Meteor.Error",
      "Meteor.call",
      "Meteor.apply",
      {name: "DDPRateLimiter", id: "ddpratelimiter"}
    ],

    {name: "Check", id: "check_package"}, [
      "check",
      "Match.test",
      {name: "Match patterns", style: "noncode"}
    ],

    {name: "Server connections", id: "connections"}, [
      "Meteor.status",
      "Meteor.reconnect",
      "Meteor.disconnect",
      "Meteor.onConnection",
      "DDP.connect"
    ],

    {name: "Collections", id: "collections"}, [
      "Mongo.Collection", [
        {instance: "collection", name: "find"},
        {instance: "collection", name: "findOne"},
        {instance: "collection", name: "insert"},
        {instance: "collection", name: "update"},
        {instance: "collection", name: "upsert"},
        {instance: "collection", name: "remove"},
        {instance: "collection", name: "allow"},
        {instance: "collection", name: "deny"},
        {instance: "collection", name: "rawCollection",
         id: "Mongo-Collection-rawCollection"},
        {instance: "collection", name: "rawDatabase",
         id: "Mongo-Collection-rawDatabase"}
      ],

      "Mongo.Cursor", [
        {instance: "cursor", name: "forEach"},
        {instance: "cursor", name: "map"},
        {instance: "cursor", name: "fetch"},
        {instance: "cursor", name: "count"},
        {instance: "cursor", name: "observe"},
        {instance: "cursor", name: "observeChanges", id: "observe_changes"}
      ],
      {type: "spacer"},
      {name: "Mongo.ObjectID", id: "mongo_object_id"},
      {type: "spacer"},
      {name: "Selectors", style: "noncode"},
      {name: "Modifiers", style: "noncode"},
      {name: "Sort specifiers", style: "noncode"},
      {name: "Field specifiers", style: "noncode"}
    ],

    "Session", [
      "Session.set",
      {name: "Session.setDefault", id: "session_set_default"},
      "Session.get",
      "Session.equals"
    ],

    {name: "Accounts", id: "accounts_api"}, [
      "Meteor.user",
      "Meteor.userId",
      "Meteor.users",
      "Meteor.loggingIn",
      "Meteor.logout",
      "Meteor.logoutOtherClients",
      "Meteor.loginWithPassword",
      {name: "Meteor.loginWith<Service>", id: "meteor_loginwithexternalservice"},
      {type: "spacer"},

      {name: "{{currentUser}}", id: "template_currentuser"},
      {name: "{{loggingIn}}", id: "template_loggingin"},
      {type: "spacer"},

      "Accounts.ui.config"
    ],

    {name: "Accounts (multi-server)", id: "advanced_accounts_api"}, [
      "AccountsClient",
      "AccountsServer",
      {type: "spacer"},

      { name: "AccountsCommon#userId", id: "accounts_userid" },
      { name: "AccountsCommon#user", id: "accounts_user" },
      { name: "AccountsCommon#config", id: "accounts_config" },
      { name: "AccountsCommon#onLogin", id: "accounts_onlogin" },
      { name: "AccountsCommon#onLoginFailure", id: "accounts_onloginfailure" },
      {type: "spacer"},

      { name: "AccountsClient#loggingIn", id: "accounts_loggingin" },
      { name: "AccountsClient#logout", id: "accounts_logout" },
      { name: "AccountsClient#logoutOtherClients", id: "accounts_logoutotherclients" },
      {type: "spacer"},

      { name: "AccountsServer#onCreateUser",
        id: "accounts_oncreateuser" },
      { name: "AccountsServer#validateLoginAttempt",
        id: "accounts_validateloginattempt" },
      { name: "AccountsServer#validateNewUser",
        id: "accounts_validatenewuser" },
    ],

    {name: "Passwords", id: "accounts_passwords"}, [
      "Accounts.createUser",
      {type: "spacer"},

      {name: "Accounts.setUsername", id: "Accounts-setUsername"},
      {name: "Accounts.addEmail", id: "Accounts-addEmail"},
      {name: "Accounts.removeEmail", id: "Accounts-removeEmail"},
      {name: "Accounts.verifyEmail", id: "accounts_verifyemail"},
      {name: "Accounts.findUserByUsername", id: "Accounts-findUserByUsername"},
      {name: "Accounts.findUserByEmail", id: "Accounts-findUserByEmail"},
      {type: "spacer"},

      "Accounts.changePassword",
      "Accounts.forgotPassword",
      "Accounts.resetPassword",
      "Accounts.setPassword",
      {type: "spacer"},

      "Accounts.sendResetPasswordEmail",
      "Accounts.sendEnrollmentEmail",
      "Accounts.sendVerificationEmail",
      {type: "spacer"},

      {name: "Accounts.onResetPasswordLink", id: "Accounts-onResetPasswordLink"},
      {name: "Accounts.onEnrollmentLink", id: "Accounts-onEnrollmentLink"},
      {name: "Accounts.onEmailVerificationLink", id: "Accounts-onEmailVerificationLink"},
      {type: "spacer"},

      "Accounts.emailTemplates"
    ],

    {name: "Templates", id: "templates_api"}, [
      {prefix: "Template", instance: "myTemplate", id: "templates_api"}, [
        {name: "events", id: "template_events"},
        {name: "helpers", id: "template_helpers"},
        {name: "onRendered", id: "template_onRendered"},
        {name: "onCreated", id: "template_onCreated"},
        {name: "onDestroyed", id: "template_onDestroyed"}
      ],
      {name: "Template instances", id: "template_inst"}, [
        {instance: "template", name: "findAll", id: "template_findAll"},
        {instance: "template", name: "$", id: "template_$"},
        {instance: "template", name: "find", id: "template_find"},
        {instance: "template", name: "firstNode", id: "template_firstNode"},
        {instance: "template", name: "lastNode", id: "template_lastNode"},
        {instance: "template", name: "data", id: "template_data"},
        {instance: "template", name: "autorun", id: "template_autorun"},
        {instance: "template", name: "subscribe", id: "Blaze-TemplateInstance-subscribe"},
        {instance: "template", name: "view", id: "template_view"}
      ],
      "Template.registerHelper",
      "Template.instance",
      "Template.currentData",
      "Template.parentData",
      "Template.body",
      {name: "{{> Template.dynamic}}", id: "template_dynamic"},
      {type: "spacer"},
      {name: "Event maps", style: "noncode"},
      {name: "Spacebars", style: "noncode"}
    ],
    "Blaze", [
      "Blaze.render",
      "Blaze.renderWithData",
      "Blaze.remove",
      "Blaze.getData",
      "Blaze.toHTML",
      "Blaze.toHTMLWithData",
      "Blaze.View", [
        "Blaze.currentView",
        "Blaze.getView",
        "Blaze.With",
        "Blaze.If",
        "Blaze.Unless",
        "Blaze.Each"
      ],
      "Blaze.Template",
      "Blaze.isTemplate",
      {type: "spacer"},
      {name: "Renderable content", id: "renderable_content", style: "noncode"}
     ],

    "Timers", [
      "Meteor.setTimeout",
      "Meteor.setInterval",
      "Meteor.clearTimeout",
      "Meteor.clearInterval"
    ],

    "Tracker", [
      "Tracker.autorun",
      "Tracker.flush",
      "Tracker.nonreactive",
      "Tracker.active",
      "Tracker.currentComputation",
      "Tracker.onInvalidate",
      "Tracker.afterFlush",
      "Tracker.Computation", [
        {instance: "computation", name: "stop", id: "computation_stop"},
        {instance: "computation", name: "invalidate", id: "computation_invalidate"},
        {instance: "computation", name: "onInvalidate", id: "computation_oninvalidate"},
        {instance: "computation", name: "onStop", id: "computation_onstop"},
        {instance: "computation", name: "stopped", id: "computation_stopped"},
        {instance: "computation", name: "invalidated", id: "computation_invalidated"},
        {instance: "computation", name: "firstRun", id: "computation_firstrun"}
      ],
      "Tracker.Dependency", [
        {instance: "dependency", name: "changed", id: "dependency_changed"},
        {instance: "dependency", name: "depend", id: "dependency_depend"},
        {instance: "dependency", name: "hasDependents", id: "dependency_hasdependents"}
      ]
    ],

    {name: "ReactiveVar", id: "reactivevar_pkg"}, [
      "ReactiveVar",
      {instance: "reactiveVar", name: "get", id: "reactivevar_get"},
      {instance: "reactiveVar", name: "set", id: "reactivevar_set"}
    ],

    // "Environment Variables", [
    //   "Meteor.EnvironmentVariable", [
    //     {instance: "env_var", name: "get", id: "env_var_get"},
    //     {instance: "env_var", name: "withValue", id: "env_var_withvalue"},
    //     {instance: "env_var", name: "bindEnvironment", id: "env_var_bindenvironment"}
    //   ]
    //],

    {name: "EJSON", id: "ejson"}, [
      {name: "EJSON.parse", id: "ejson_parse"},
      {name: "EJSON.stringify", id: "ejson_stringify"},
      {name: "EJSON.fromJSONValue", id: "ejson_from_json_value"},
      {name: "EJSON.toJSONValue", id: "ejson_to_json_value"},
      {name: "EJSON.equals", id: "ejson_equals"},
      {name: "EJSON.clone", id: "ejson_clone"},
      {name: "EJSON.newBinary", id: "ejson_new_binary"},
      {name: "EJSON.isBinary", id: "ejson_is_binary"},
      {name: "EJSON.addType", id: "ejson_add_type"},
      [
        {instance: "customType", id: "ejson_type_typeName", name: "typeName"},
        {instance: "customType", id: "ejson_type_toJSONValue", name: "toJSONValue"},
        {instance: "customType", id: "ejson_type_clone", name: "clone"},
        {instance: "customType", id: "ejson_type_equals", name: "equals"}
      ]
    ],


    "HTTP", [
      "HTTP.call",
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

    {name: "package.js", id: "packagejs"}, [
      {name: "Package.describe", id: "packagedescription"},
      {name: "Package.onUse", id: "packagedefinition"}, [
        {name: "api.versionsFrom", id: "pack_versions"},
        {name: "api.use", id: "pack_use"},
        {name: "api.imply", id: "pack_api_imply"},
        {name: "api.export", id: "pack_export"},
        {name: "api.addFiles", id: "pack_addFiles"},
        {name: "api.addAssets", id: "PackageAPI-addAssets"}
      ],
      {name: "Package.onTest", id: "packagetests"},
      {name: "Npm.depends", id: "Npm-depends"},
      {name: "Npm.require", id: "Npm-require"},
      {name: "Cordova.depends", id: "Cordova-depends"},
      {name: "Package.registerBuildPlugin", id: "Package-registerBuildPlugin"}, [
        {name: "Plugin.registerSourceHandler", id: "Plugin-registerSourceHandler"}
      ]
    ],

    {name: "mobile-config.js", id: "mobileconfigjs"}, [
      {name: "App.info", id: "App-info"},
      {name: "App.setPreference", id: "App-setPreference"},
      {name: "App.accessRule", id: "App-accessRule"},
      {name: "App.configurePlugin", id: "App-configurePlugin"},
      {name: "App.icons", id: "App-icons"},
      {name: "App.launchScreens", id: "App-launchScreens"}
    ]
  ],

  "Packages", [ [
    "appcache",
    "accounts-ui",
    "audit-argument-checks",
    "coffeescript",
    "jquery",
    "less",
    "markdown",
    "oauth-encryption",
    "random",
    {name: "spiderable", link: "https://atmospherejs.com/meteor/spiderable"},
    "underscore",
    "webapp"
  ] ],

  "Command line", [ [
    "meteor help",
    "meteor run",
    "meteor debug",
    "meteor create",
    "meteor deploy",
    "meteor logs",
    "meteor update",
    "meteor add",
    "meteor remove",
    "meteor list",
    "meteor mongo",
    "meteor reset",
    "meteor build",
    "meteor lint",
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

Template.nav.helpers({
  sections: function () {
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

          var id = item.id || (item.name && name_to_id(item.name)) || "";

          ret.push(_.extend({
            type: "section",
            link: "#/full/" + id,
            depth: depth,
            style: ''
          }, item));
        }
      });
    };

    walk(toc, 1);
    return ret;
  },

  type: function (what) {
    return this.type === what;
  },

  maybe_current: function () {
    return Session.get('urlHash').split('/')[2] === this.id ? 'current' : '';
  }
});

Template.nav_section.helpers({
  depthIs: function (n) {
    return this.depth === n;
  }
});
