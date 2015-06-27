var section = function (title, options) {
  return _.extend({}, {
    type: "section",
    title: title,
  }, options);
};

var item = function (name, options) {
  if (! options) {
    options = {
      longname: name
    };
  }

  return _.extend({}, {
    type: "item",
    name: name
  }, options);
};

var sections = [
  section("", {
    subsections: [
      section("Quick Start", {
        id: "quickstart"
      }),
      section("Principles", {
        id: "sevenprinciples"
      }),
      section("Learning Resources", {
        id: "learning-resources"
      }),
      section("Command Line Tool", {
        id: "command-line"
      }),
      section("File Structure", {
        id: "filestructure"
      }),
      section("Building Mobile Apps", {
        id: "buildingmobileapps"
      })
    ]
  }),
  section("Templates", {
    id: "templates",
    subtitle: "Create views that update automatically when data changes",
    items: [
      item("Defining templates in HTML", {id: "defining-templates"}),
      item("Template.<em>name</em>.helpers", {longname: "Template#helpers"}),
      item("Template.<em>name</em>.events", {longname: "Template#events"}),
      item("Template.<em>name</em>.onRendered", {longname: "Template#onRendered"}),
      item("<em>template</em>.findAll", {longname: "Blaze.TemplateInstance#findAll"}),
      item("<em>template</em>.find", {longname: "Blaze.TemplateInstance#find"})
    ]
  }),
  section("Session", {
    id: "session",
    subtitle: "Store temporary data for the user interface",
    items: [
      item("Session.set"),
      item("Session.get")
    ]
  }),
  section("Tracker", {
    id: "tracker",
    subtitle: "Re-run functions when data changes",
    items: [
      item("Tracker.autorun")
    ]
  }),
  section("Collections", {
    id: "collections",
    subtitle: "Store persistent data",
    items: [
      item("Mongo.Collection"),
      item("<em>collection</em>.findOne", {longname: "Mongo.Collection#findOne"}),
      item("<em>collection</em>.find", {longname: "Mongo.Collection#find"}),
      item("<em>collection</em>.insert", {longname: "Mongo.Collection#insert"}),
      item("<em>collection</em>.update", {longname: "Mongo.Collection#update"}),
      item("<em>collection</em>.remove", {longname: "Mongo.Collection#remove"}),
      item("<em>collection</em>.allow", {longname: "Mongo.Collection#allow"}),
      item("<em>collection</em>.deny", {longname: "Mongo.Collection#deny"}),
    ]
  }),
  section("Accounts", {
    id: "accounts",
    subtitle: "Let users log in with passwords, Facebook, Google, GitHub, etc.",
    items: [
      item("{{> loginButtons}}", {id: "loginButtons"}),
      item("Meteor.user"),
      item("Meteor.userId"),
      item("Meteor.users"),
      item("{{currentUser}}", {longname: "currentUser"})
    ]
  }),
  section("Methods", {
    id: "methods",
    subtitle: "Call server functions from the client",
    items: [
      item("Meteor.methods"),
      item("Meteor.call"),
      item("Meteor.Error")
    ]
  }),
  section("Publish / Subscribe", {
    id: "pubsub",
    subtitle: "Sync part of your data to the client",
    items: [
      item("Meteor.publish"),
      item("Meteor.subscribe")
    ]
  }),
  section("Environment", {
    id: "environment",
    subtitle: "Control when and where your code runs",
    items: [
      item("Meteor.isClient"),
      item("Meteor.isServer"),
      item("Meteor.startup")
    ]
  }),
  section("Packages", {
    id: "packages",
    subtitle: "Choose from thousands of community packages",
    items: [
      item("Searching for packages", {id: "searchingforpackages"}),
      item("accounts-ui", {id: "accountsui"}),
      item("coffeescript"),
      item("email"),
      item("jade"),
      item("jquery"),
      item("http"),
      item("less"),
      item("markdown"),
      item("underscore"),
      item("spiderable")
    ]
  })
];

var linkPrefix = "#/basic/";
var linkFromIdLongname = function (id, longname) {
  if (id) {
    return linkPrefix + id;
  } else if (longname) {
    return linkPrefix + longname.replace(/[#.]/g, "-");
  }
};
Template.basicTableOfContents.helpers({
  sections: sections,
  linkForItem: function () {
    return linkFromIdLongname(this.id, this.longname);
  },
  maybeCurrent: function () {
    return Session.get('urlHash') === linkFromIdLongname(this.id, this.longname)
      ? 'current' : '';
  }
});
