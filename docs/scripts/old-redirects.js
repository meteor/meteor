// These are the redirects that were previously setup for the docs
var oldRedirects = function() {
  // make links backwards compatible - for example, #deps -> #tracker

  // Links from the old basic API into the closest full-api section
  var BASIC_TO_FULL_LINKS = {
    'learning-resources': 'guide',
    'command-line': 'commandline',
    'templates': 'templates_api',
    'defining-templates': 'templates_api',
    'Template-helpers': 'template_helpers',
    'Template-events': 'template_events',
    'Template-onRendered': 'template_onRendered',
    'Blaze-TemplateInstance-findAll': 'template_findAll',
    'Blaze-TemplateInstance-find': 'template_find',
    'session': 'session',
    'Session-set': 'session_set',
    'Session-get': 'session_get',
    'tracker': 'tracker',
    'Tracker-autorun': 'tracker_autorun',
    'collections': 'collections',
    'Mongo-Collection': 'mongo_collection',
    'Mongo-Collection-findOne': 'findone',
    'Mongo-Collection-find': 'find',
    'Mongo-Collection-insert': 'insert',
    'Mongo-Collection-update': 'update',
    'Mongo-Collection-remove': 'remove',
    'Mongo-Collection-allow': 'allow',
    'Mongo-Collection-deny': 'deny',
    'accounts': 'accounts_api',
    'loginButtons': 'accountsui',
    'Meteor-user': 'meteor_user',
    'Meteor-userId': 'meteor_userid',
    'Meteor-users': 'meteor_users',
    'currentUser': 'template_currentuser',
    'methods': 'methods_header',
    'Meteor-methods': 'meteor_methods',
    'Meteor-call': 'meteor_call',
    'Meteor-Error': 'meteor_error',
    'pubsub': 'publishandsubscribe',
    'Meteor-publish': 'meteor_publish',
    'Meteor-subscribe': 'meteor_subscribe',
    'environment': 'core',
    'Meteor-isClient': 'meteor_isclient',
    'Meteor-isServer': 'meteor_isserver',
    'Meteor-startup': 'meteor_startup',
    'packages': 'packages',
    'searchingforpackages': 'packages',
    'accountsui': 'accountsui',
    'coffeescript': 'coffeescript',
    'email': 'email',
    'less': 'less',
    'markdown': 'markdown',
    'underscore': 'underscore',
    'spiderable': 'spiderable',
  };

  var BASIC_TO_GUIDE_LINKS = {
    filestructure: 'structure.html',
    buildingmobileapps: 'mobile.html',
    quickstart: '#quickstart',
  };

  var FULL_TO_GUIDE_LINKS = {
    whatismeteor: '#what-is-meteor',
    sevenprinciples: '#what-is-meteor',
    quickstart: '#quickstart',
    structuringyourapp: 'structure.html',
    dataandsecurity: 'security.html',
    livehtmltemplates: '#what-is-meteor',
    usingpackages: 'user-packages.html',
    namespacing: 'structure.html',
    deploying: 'deployment.html',
    writingpackages: 'writing-packages.html',
  };


  var getRedirect = function (hash) {
    if (hash.indexOf("deps") !== -1) {
      return hash.replace("deps", "tracker");
    }

    if (hash.indexOf("_created") !== -1) {
      return hash.replace("_created", "_onCreated");
    }

    if (hash.indexOf("_rendered") !== -1) {
      return hash.replace("_rendered", "_onRendered");
    }

    if (hash.indexOf("_destroyed") !== -1) {
      return hash.replace("_destroyed", "_onDestroyed");
    }

    if (hash === "meteor_collection") {
      return "mongo_collection";
    }

    if (hash === "collection_object_id") {
      return "mongo_object_id";
    }

    if (hash === "match") {
      return "check_package";
    }

    if (hash === "meteorbundle") {
      return "meteorbuild";
    }

    if (hash.indexOf("reactivity") !== -1) {
      return "/full/tracker";
    }

    var parts = hash.split('/');
    if (parts[1] === 'basic') {
      var fullLink = BASIC_TO_FULL_LINKS[parts[2]];
      if (fullLink) {
        return '/full/' + fullLink;
      }

      var guideLink = BASIC_TO_GUIDE_LINKS[parts[2]];
      if (guideLink) {
        window.location.replace('http://guide.meteor.com/' + guideLink);
      }
    }
    if (parts[1] === 'full') {
      var guideLink = FULL_TO_GUIDE_LINKS[parts[2]];
      if (guideLink) {
        window.location.replace('http://guide.meteor.com/' + guideLink);
      }
    }

    // don't redirect
    return false;
  };

  var curLink = window.location.hash.slice(1);
  var redirect = getRedirect(curLink);

  if (redirect) {
    window.location = "#" + redirect;
  }
}

hexo.extend.tag.register('oldRedirects', function(args) {
  return '<script>\n' +
    'var oldRedirects = ' + oldRedirects + ';\n' +
    'oldRedirects();\n' +
    '</script>';
});
