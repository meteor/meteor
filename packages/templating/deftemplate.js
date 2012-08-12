(function() {

  Meteor._partials = {};

  // XXX Handlebars hooking is janky and gross

  Meteor._hook_handlebars = function () {
    Meteor._hook_handlebars = function(){}; // install the hook only once

    var orig = Handlebars._default_helpers.each;
    Handlebars._default_helpers.each = function (arg, options) {
      if (!(arg instanceof LocalCollection.Cursor))
        return orig.call(this, arg, options);

      return Spark.list(
        arg,
        function (item) {
          return Spark.labelBranch(item._id || null, function () {
            var html = Spark.isolate(_.bind(options.fn, null, item));
            return Spark.setDataContext(item, html);
          });
        },
        function () {
          return options.inverse ?
            Spark.isolate(options.inverse) : '';
        }
      );
    };

    _.extend(Handlebars._default_helpers, {
      isolate: function (options) {
        var data = this;
        return Spark.isolate(function () {
          return options.fn(data);
        });
      },
      constant: function (options) {
        var data = this;
        return Spark.createLandmark({ constant: true }, function () {
          return options.fn(data);
        });
      }
    });
  };

  // map from landmark id, to the 'this' object for
  // create/render/destroy callbacks on templates
  var templateInstanceData = {};

  //setup migration for template stores
  var templateStoresByPath = {};
  if (Meteor._reload) {
    Meteor._reload.on_migrate('templateStores',function() {
      var stores = {}
      _.each(templateInstanceData,function(template) {
        stores[template.path()] = template.store;
      });
      return [true,stores];
    });
    (function() {
      var migration_data = Meteor._reload.migration_data('templateStores');
      if (migration_data) {
        templateStoresByPath = migration_data;

        // should delete all template stores after first render ?
        
      }
    })();
  }

  var templateObjFromLandmark = function (landmark) {
    var template = templateInstanceData[landmark.id] || (
      templateInstanceData[landmark.id] = {
        // set these once
        find: function (selector) {
          if (! landmark.hasDom())
            throw new Error("Template not in DOM");
          return landmark.find(selector);
        },
        findAll: function (selector) {
          if (! landmark.hasDom())
            throw new Error("Template not in DOM");
          return landmark.findAll(selector);
        },

        store: ReactiveDict(),

        path: function() {
          return "/" + $(this.firstNode).parents().andSelf().map(function() {
            var $this = $(this);
            var tagName = this.nodeName;
            if ($this.siblings(tagName).length > 0) {
                tagName += "[" + $this.prevAll(tagName).length + "]";
            }
            return tagName;
          }).get().join("/");
        },

        set: function(key,value) {
          return this.store.set(key,value);
        },

        get: function(key) {
          return this.store.get(key);
        },

        firstRender: true
      });
    // set these each time
    template.firstNode = landmark.hasDom() ? landmark.firstNode() : null;
    template.lastNode = landmark.hasDom() ? landmark.lastNode() : null;
    return template;
  };

  Meteor._def_template = function (name, raw_func) {
    Meteor._hook_handlebars();

    window.Template = window.Template || {};

    // Define the function assigned to Template.<name>.

    var partial = function (data) {
      data = data || {};
      var tmpl = name && Template[name] || {};

      var html = Spark.createLandmark({
        preserve: tmpl.preserve || {},
        create: function () {
          var template = templateObjFromLandmark(this);
          template.data = data;
          tmpl.create && tmpl.create.call(template);
        },
        render: function () {
          var template = templateObjFromLandmark(this);
          template.data = data;
          tmpl.render && tmpl.render.call(template);

          //restore store
          var path = template.path();
          if (template.firstRender && path in templateStoresByPath) {
            template.store.setMany(templateStoresByPath[path]);
          }
          template.firstRender = false;
        },
        destroy: function () {
          tmpl.destroy &&
            tmpl.destroy.call(templateObjFromLandmark(this));
          delete templateInstanceData[this.id];
        }
      }, function (landmark) {
        // make template accessible from within helpers
        data.template = templateObjFromLandmark(landmark);
        
        var html = Spark.isolate(function () {
          // XXX Forms needs to run a hook before and after raw_func
          // (and receive 'landmark')
          return raw_func(data, {
            helpers: partial,
            partials: Meteor._partials,
            name: name
          });
        });

        // take an event map with `function (event, template)` handlers
        // and produce one with `function (event, landmark)` handlers
        // for Spark, by inserting logic to create the template object.
        var wrapEventMap = function (oldEventMap) {
          var newEventMap = {};
          _.each(oldEventMap, function (handler, key) {
            newEventMap[key] = function (event, landmark) {
              return handler.call(this, event,
                                  templateObjFromLandmark(landmark));
            };
          });
          return newEventMap;
        };

        // events need to be inside the landmark, not outside, so
        // that when an event fires, you can retrieve the enclosing
        // landmark to get the template data
        if (tmpl.events)
          html = Spark.attachEvents(wrapEventMap(tmpl.events), html);
        return html;
      });

      html = Spark.setDataContext(data, html);
      return html;
    };

    // XXX hack.. copy all of Handlebars' built in helpers over to
    // the partial. it would be better to hook helperMissing (or
    // something like that?) so that Template.foo is searched only
    // if it's not a built-in helper.
    _.extend(partial, Handlebars.helpers);


    if (name) {
      if (Template[name])
        throw new Error("There are multiple templates named '" + name +
                        "'. Each template needs a unique name.");

      Template[name] = partial;

      Meteor._partials[name] = partial;
    }

    // useful for unnamed templates, like body
    return partial;
  };

})();
