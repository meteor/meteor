(function() {

  Meteor._partials = {};

  // XXX Handlebars hooking is janky and gross

  Meteor._hook_handlebars = function () {
    Meteor._hook_handlebars = function(){}; // install the hook only once

    var orig = Handlebars._default_helpers.each;
    Handlebars._default_helpers.each = function (arg, options) {
      // if arg isn't an observable (like LocalCollection.Cursor),
      // don't use this reactive implementation of #each.
      if (!(arg && 'observe' in arg))
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

  // XXX forms hooks into this to add "bind"?
  Meteor._template_decl_methods = {
    // methods store data here (event map, etc.).  initialized per template.
    _tmpl_data: null,
    // these functions must be generic (i.e. use `this`)
    events: function (eventMap) {
      var events =
            (this._tmpl_data.events = (this._tmpl_data.events || {}));
      _.extend(events, eventMap);
    },
    preserve: function (preserveMap) {
      var preserve =
            (this._tmpl_data.preserve = (this._tmpl_data.preserve || {}));

      if (_.isArray(preserveMap))
        _.each(preserveMap, function (selector) {
          preserve[selector] = true;
        });
      else
        _.extend(preserve, preserveMap);
    },
    helpers: function (helperMap) {
      var helpers =
            (this._tmpl_data.helpers = (this._tmpl_data.helpers || {}));
      for(var h in helperMap)
        helpers[h] = helperMap[h];
    }
  };

  Meteor._def_template = function (name, raw_func) {
    Meteor._hook_handlebars();

    window.Template = window.Template || {};

    // Define the function assigned to Template.<name>.

    var partial = function (data) {
      data = data || {};
      var tmpl = name && Template[name] || {};
      var tmplData = tmpl._tmpl_data || {};

      var html = Spark.createLandmark({
        preserve: tmplData.preserve || {},
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
          // template.data is already set from previous callbacks
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
            helpers: _.extend({}, partial, tmplData.helpers || {}),
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

        // support old Template.foo.events = {...} format
        var events =
              (tmpl.events !== Meteor._template_decl_methods.events ?
               tmpl.events : tmplData.events);
        // events need to be inside the landmark, not outside, so
        // that when an event fires, you can retrieve the enclosing
        // landmark to get the template data
        if (tmpl.events)
          html = Spark.attachEvents(wrapEventMap(events), html);
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
      _.extend(partial, Meteor._template_decl_methods);
      partial._tmpl_data = {};

      Meteor._partials[name] = partial;
    }

    // useful for unnamed templates, like body
    return partial;
  };

})();
