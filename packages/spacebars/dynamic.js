var Template = Blaze.Template;

/**
 * @isTemplate true
 * @memberOf Template
 * @function dynamic
 * @summary Choose a template to include dynamically, by name.
 * @locus Templates
 * @param {String} template The name of the template to include.
 * @param {Object} [data] Optional. The data context in which to include the
 * template.
 */

// The compiled version is here to avoid having Spacebars depend on Templating.
// If we split out the build plugin part of templating from the runtime, it
// might be possible to use templating here instead.

// Expects the data context to have a `template` property (the name of the
// template to render) and an optional `data` property. If the `data` property
// is not specified, then the parent data context will be used instead. Uses the
// __dynamicWithDataContext template below to actually render the template.
Template.__checkName("__dynamic");
Template["__dynamic"] = new Template("Template.__dynamic", (function() {
  var view = this;
  return [ Blaze.View("lookup:checkContext", function() {
    return Spacebars.mustache(view.lookup("checkContext"));
  }), "\n  ", Blaze.If(function() {
    return Spacebars.call(view.lookup("dataContextPresent"));
  }, function() {
    return [ "\n    ", Spacebars.include(view.lookupTemplate("__dynamicWithDataContext")), "\n  " ];
  }, function() {
    return [ "\n    \n    ", Blaze._TemplateWith(function() {
      return {
        template: Spacebars.call(view.lookup("template")),
        data: Spacebars.call(view.lookup(".."))
      };
    }, function() {
      return Spacebars.include(view.lookupTemplate("__dynamicWithDataContext"));
    }), "\n  " ];
  }) ];
}));

// Expects the data context to have a `template` property (the name of the
// template to render) and a `data` property, which can be falsey.
Template.__checkName("__dynamicWithDataContext");
Template["__dynamicWithDataContext"] = new Template("Template.__dynamicWithDataContext", (function() {
  var view = this;
  return Spacebars.With(function() {
    return Spacebars.dataMustache(view.lookup("chooseTemplate"), view.lookup("template"));
  }, function() {
    return [ "\n    ", Blaze._TemplateWith(function() {
      return Spacebars.call(Spacebars.dot(view.lookup(".."), "data"));
    }, function() {
      return Spacebars.include(view.lookupTemplate(".."));
    }), "    \n  " ];
  });
}));

Template.__dynamicWithDataContext.helpers({
  chooseTemplate: function (name) {
    return Blaze._getTemplate(name, function () {
      return Template.instance();
    });
  }
});

Template.__dynamic.helpers({
  dataContextPresent: function () {
    return _.has(this, "data");
  },
  checkContext: function () {
    if (! _.has(this, "template")) {
      throw new Error("Must specify name in the 'template' argument " +
                      "to {{> Template.dynamic}}.");
    }

    _.each(this, function (v, k) {
      if (k !== "template" && k !== "data") {
        throw new Error("Invalid argument to {{> Template.dynamic}}: " +
                        k);
      }
    });
  }
});
