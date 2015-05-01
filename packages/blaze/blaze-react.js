BlazeReact = {};

// raw components registry
BlazeReact.components = {};

// allow Templates to add mixins to the underlying react component
Blaze.Template.prototype.reactMixin = function (mixin) {
  if (this.__reactMixins) {
    this.__reactMixins.push(mixin);
  } else {
    throw new Error('cannot add React mixin to non-React template.');
  }
};

// This method allows us to defer the definition of a template's ReactComponent
// class until first render so that it can have access to user-defined mixins.
Blaze.Template.prototype._getReactComponent = function () {
  if (!this.__reactComponent) {
    this.__reactComponent = BlazeReact.createComponent(this);
  }
  return this.__reactComponent;
};

/**
 * Create a ReactComponnet class from a render function.
 * This component is attached to a Blaze.Template.
 */
BlazeReact.createComponent = function (template) {
  return React.createClass({

    // Mixin template instance API.
    // Note that here we are using the component instance as `this` inside
    // lifecycle callbacks instead of a real template instance.
    mixins: [TemplateInstanceAPIMixin].concat(template.__reactMixins),

    componentWillMount: function () {
      // Optimization
      // 
      // First, we don't want the entire application to re-render when a
      // deeply nested template's dependency changed. So we wrap our own
      // render call inside Tracker.nonreactive to prevent it registering
      // dependency on the root render autorun.
      // 
      // Then, we do our own autorun: on first call we render this component,
      // and later on whenever a dependency changes, we simply call setState()
      // on this component only to trigger a local re-render.
      var self = this;
      var view = this.view = this.props.view;
      var rendered = false;
      Tracker.nonreactive(function () {
        view.autorun(function () {
          if (!rendered) {
            template.renderFunction.call(view);
            rendered = true;
          } else {
            self.setState({});
          }
        });
      });
      view.templateInstance = function () {
        return self;
      };
      // subscription state
      this._allSubsReadyDep = new Tracker.Dependency();
      this._allSubsReady = false;
      this._subscriptionHandles = {};
      // fire created callbacks
      fireCallbacks(this, template, 'created');
    },

    componentDidMount: function () {
      fireCallbacks(this, template, 'rendered');
      var self = this;
      var view = this.props.view;
      // initialize events
      _.each(template.__eventMaps, function (m) {
        BlazeReact._addEventMap(view, m, view, self);
      });
    },

    render: function () {
      var view = this.props.view;
      var vdom = Blaze._withCurrentView(view, function () {
        return template.renderFunction.call(view);
      });
      var wrapperProps = {
        ref: function (comp) {
          if (comp) {
            React.findDOMNode(comp).$blaze_view = view;
          }
        }
      };
      if (_.isArray(vdom)) {
        // if the template has more than 1 top-level elements, it has to be
        // wrapped inside a div because React Components must return only
        // a single element.
        this.isWrapped = true;
        vdom.unshift(wrapperProps);
        return React.DOM.span.apply(null, vdom);
      } else if (typeof vdom === 'string') {
        // wrap string inside a span
        this.isWrapped = true;
        return React.DOM.span(wrapperProps, vdom);
      } else {
        this.isWrapped = false;
        if (vdom) {
          vdom = React.cloneElement(vdom, wrapperProps);
        }
        return vdom;
      }
    },

    componentWillUnmount: function () {
      Blaze._destroyView(this.props.view);
      fireCallbacks(this, template, 'destroyed');
    }
  });
};

function fireCallbacks (component, template, type) {
  var callbacks = template._getCallbacks(type);
  Template._withTemplateInstanceFunc(
    function () { return component; },
    function () {
      for (var i = 0, N = callbacks.length; i < N; i++) {
        callbacks[i].call(component);
      }
    });
}

//
// Built-in Render Helpers
//

// the internal with that renders a content block
// with a data context.
BlazeReact._With = function (data, contentFunc, parentView) {
  // local data context
  var view = Blaze.With(data);
  // set parent view for ../ lookups
  Blaze._createView(view, parentView);
  // inherit parent helpers
  view.template = parentView.template;
  // call render using the with view as current view
  // so that the block is rendered with the correct
  // data context.
  return Blaze._withCurrentView(view, function () {
    return _.map(contentFunc.call(null, view), function (c) {
      // for every top-level element in the with block, we set a
      // `$blaze_view` property on the rendered DOM element (which is
      // not visible in the DOM inspector).  this is so that event
      // handlers can pick up the correct data context.
      if (c && typeof c.type === 'string') {
        // normal element
        return React.cloneElement(c, { ref: function (comp) {
          if (comp) {
            React.findDOMNode(comp).$blaze_view = view;
          }
        }});
      } else {
        // component will set its own `$blaze_view` property
        return c;
      }
    });
  });
};

// the external with that also handles the {{else}} condition.
BlazeReact.With = function (argFunc, contentFunc, elseFunc, parentView) {
  var withContentFunc = function () {
    return BlazeReact._With(argFunc(), contentFunc, parentView);
  };
  return BlazeReact.If(argFunc, withContentFunc, elseFunc);
};

BlazeReact.If = function (argFunc, contentFunc, elseFunc, unless) {
  var condition = argFunc();
  if (unless) condition = !condition;
  return condition
    ? contentFunc()
    : elseFunc
      ? elseFunc()
      : null;
};

BlazeReact.Each = function (dataFunc, contentFunc, parentView, shouldHaveKey) {
  var list = dataFunc();
  list = list && list.fetch
    ? list.fetch()
    : list;
  return _.flatten(_.map(list, function (data, i) {
    var content = BlazeReact._With(data, contentFunc, parentView);
    var res = content.length > 1 ? content : content[0];
    if (shouldHaveKey && res) { // this also means there's only one element
      // supply a key so React doesn't complain
      res = React.cloneElement(res, { key: data._id || i });
    }
    return res;
  }));
};

BlazeReact.include = function (template, parentView, data) {
  if (typeof data === 'function') {
    data = data();
  }
  // three possible types for template here:
  // 1. a Blaze.Template (static include)
  // 2. a raw React Component
  // 3. a function (dynamic inclusion)
  if (BlazeReact.isReactComponent(template)) {
    // just pass the data as props to the raw component
    return React.createElement(template, data || null);
  } else {
    if (typeof template === 'function') {
      template = template();
      if (! Blaze.isTemplate(template)) {
        // in __dynamicWithDataContext, {{> .. ../data}} here we'd get a
        // context object in the form of { template: ..., data: ... }
        data = template.data;
        template = Template[template.template];
      }
    }
    var view = data
      ? Blaze.With(data)
      : new Blaze.View();
    // instead of calling template.constructView, we can simply set the view's
    // template to enable template helper lookups.
    view.template = template;
    Blaze._createView(view, parentView);
    return React.createElement(template._getReactComponent(), {
      view: view
    });
  }
};

BlazeReact.raw = function (value) {
  return React.DOM.div({
    dangerouslySetInnerHTML: {
      __html: value
    }
  });
};

// Event Handling

BlazeReact._addEventMap = function (view, eventMap, thisInHandler, component) {
  thisInHandler = (thisInHandler || null);
  var handles = [];
  var element = React.findDOMNode(component);

  _.each(eventMap, function (handler, spec) {
    var clauses = spec.split(/,\s+/);
    // iterate over clauses of spec, e.g. ['click .foo', 'click .bar']
    _.each(clauses, function (clause) {
      var parts = clause.split(/\s+/);
      if (parts.length === 0)
        return;

      var newEvents = parts.shift();
      var selector = parts.join(' ');
      handles.push(Blaze._EventSupport.listen(
        element, newEvents, selector,
        function (evt) {
          var handlerThis = thisInHandler || this;
          var handlerArgs = arguments;
          return Blaze._withCurrentView(view, function () {
            return handler.apply(handlerThis, handlerArgs);
          });
        }
      ));
    });
  });

  view.onViewDestroyed(function () {
    _.each(handles, function (h) {
      h.stop();
    });
    handles.length = 0;
  });
};

// Template instance API mixin

var TemplateInstanceAPIMixin = {};

TemplateInstanceAPIMixin.$ = function (selector) {
  var el = $(React.findDOMNode(this));
  var els = el.find(selector);
  if (!this.isWrapped) {
    // we need to include the root node itself if we
    // don't have a wrapper node.
    els = els.add(el.filter(selector));
  }
  return els;
};

// just reuse Blaze.TemplateInstance prototype methods
_.each(
  ['find', 'findAll', 'autorun', 'subscribe', 'subscriptionsReady'],
  function (method) {
    TemplateInstanceAPIMixin[method] = Blaze.TemplateInstance.prototype[method];
  }
);

// Utils

//XXX A non-rigid check to tell if something is a ReactComponent class.
BlazeReact.isReactComponent = function (component) {
  return typeof component === 'function' &&
    component.prototype.setState;
}
