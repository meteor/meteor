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
          return Spark.labelBranch(
            item._id || Spark.UNIQUE_LABEL, function () {
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
  // created/rendered/destroyed callbacks on templates
  var templateInstanceData = {};

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
        }
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
    },

    plugins: function (pluginMap) {
      var plugins = 
        (this._tmpl_data.plugins = (this._tmpl_data.plugins || {}));

      // CM: Store callback array for landmark lifecycle methods.
      var callbackMap =
        (this._tmpl_data.callbackMap = (this._tmpl_data.callbackMap || {}));

      var plugin;
      var callbacks;

      for(var p in pluginMap) {
        plugin = plugins[p] = pluginMap[p];
        _.each(['created', 'rendered', 'destroyed'], function (cb) {
          if (plugin[cb]) {
            callbacks = 
              (callbackMap[cb] = (callbackMap[cb] || []));
            //CM: keep plugins 'this' pointing to the plugin itself
            callbacks.push(_.bind(plugin[cb], plugin));
          }
        });
      }
    }
  };

  Meteor._def_template = function (name, raw_func) {
    Meteor._hook_handlebars();

    window.Template = window.Template || {};

    // Define the function assigned to Template.<name>.

    var partial = function (data) {
      var tmpl = name && Template[name] || {};
      var tmplData = tmpl._tmpl_data || {};
      var tmplPlugins = tmplData.plugins || {};
      var tmplCallbacks = tmplData.callbackMap || {};

      var runCallbacks = function (cbName) {
        var self = this;
        var callbacks;
        var args = _.toArray(arguments).slice(1);

        if (callbacks = tmplCallbacks[cbName]) {
          _.each(callbacks, function (callback) {
            callback.apply(self, args);
          });
        }
      };

      var html = Spark.labelBranch("Template."+name, function () {
        var html = Spark.createLandmark({
          preserve: tmplData.preserve || {},
          created: function () {
            var template = templateObjFromLandmark(this);
            template.data = data;
            template.plugins = tmplData.plugins;
            runCallbacks.call(template, 'created', template);
            tmpl.created && tmpl.created.call(template);
          },
          rendered: function () {
            var template = templateObjFromLandmark(this);
            template.data = data;
            template.plugins = tmplData.plugins;
            runCallbacks.call(template, 'rendered', template);
            tmpl.rendered && tmpl.rendered.call(template);
          },
          destroyed: function () {
            var template = templateObjFromLandmark(this);
            // template.data is already set from previous callbacks
            runCallbacks.call(template, 'destroyed', template);
            tmpl.destroyed && tmpl.destroyed.call(template);
            delete templateInstanceData[this.id];
          }
        }, function (landmark) {
          var html = Spark.isolate(function () {
            // XXX Forms needs to run a hook before and after raw_func
            // (and receive 'landmark')
            
            var helpers = _.extend({}, partial, tmplData.helpers || {});
            var addPluginHelpers = function (plugin) {
              if (plugin.helpers) {
                _.each(plugin.helpers, function (fn, key) {
                  // make sure the plugin is always the first parameter
                  helpers[key] = function () {
                    var args = [plugin].concat(_.toArray(arguments));
                    return fn.apply(this, args);
                  }
                });
              }
            }

            _.each(tmplData.plugins, addPluginHelpers);

            return raw_func(data, {
              helpers: helpers,
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

          var attachPluginEvents = function (plugin) {
            if (plugin.events) {
              // CM: first bind the handlers to the plugin
              for (var key in plugin.events) {
                plugin.events[key] = _.bind(plugin.events[key], plugin);
              }

              html = Spark.attachEvents(wrapEventMap(plugin.events), html);
            }
          };

          //CM: Not sure if this is the right approach. Goal is to allow
          //template plugins to add their own event handlers without clobbering
          //other handler maps.
          _.each(tmplData.plugins, attachPluginEvents);

          return html;
        });
        html = Spark.setDataContext(data, html);
        return html;
      });

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
