BlazeReact = {};

/**
 * Create a ReactComponnet class from a render function.
 * This component is attached to a Blaze.Template.
 */
BlazeReact.createComponent = function (template, renderFunction) {
  return React.createClass({

    mixins: [TemplateInstanceAPIMixin],

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
      var view = this.props.view;
      var rendered = false;
      Tracker.nonreactive(function () {
        view.autorun(function () {
          if (!rendered) {
            renderFunction.call(view);
            rendered = true;
          } else {
            self.setState({});
          }
        });
      });
      fireCallbacks(this, template, 'created');
    },

    componentDidMount: function () {
      fireCallbacks(this, template, 'rendered');
    },

    render: function () {
      var view = this.props.view;
      var vdom = Blaze._withCurrentView(view, function () {
        return renderFunction.call(view);
      });
      if (_.isArray(vdom)) {
        // if the template has more than 1 top-level elements, it has to be
        // wrapped inside a div because React Components must return only
        // a single element.
        this.isWrapped = true;
        vdom.unshift(null);
        return React.DOM.span.apply(null, vdom);
      } else if (typeof vdom === 'string') {
        // wrap string inside a span
        this.isWrapped = true;
        return React.DOM.span(null, vdom);
      } else {
        this.isWrapped = false;
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
  for (var i = 0, l = callbacks.length; i < l; i++) {
    callbacks[i].call(component);
  }
}

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
    return contentFunc.call(null, view);
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
    if (shouldHaveKey) { // this also means there's only one element
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
  var view = data
    ? Blaze.With(data)
    : new Blaze.View();
  // instead of calling template.constructView, we can simply set the view's
  // template to enable template helper lookups.
  view.template = template;
  Blaze._createView(view, parentView);
  return React.createElement(template.reactComponent, {
    view: view
  });
};

BlazeReact.raw = function (value) {
  return React.DOM.div({
    dangerouslySetInnerHTML: {
      __html: value
    }
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

TemplateInstanceAPIMixin.findAll = function (selector) {
  return Array.prototype.slice.call(this.$(selector));
};

TemplateInstanceAPIMixin.find = function (selector) {
  var result = this.$(selector);
  return result[0] || null;
};

TemplateInstanceAPIMixin.autorun = function (f) {
  return this.props.view.autorun(f);
};