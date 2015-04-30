BlazeReact = {};

BlazeReact.render = function (template, container) {
  var view = template.constructView();
  Blaze._createView(view);
  Tracker.nonreactive(function () {
    view.autorun(function () {
      React.render(
        React.createElement(template.reactComponent, {
          view: view
        }),
        container
      );
    });
  });
};

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
  return _.map(list, function (data) {
    var content = BlazeReact._With(data, contentFunc, parentView);
    var res = content.length > 1 ? content : content[0];
    return res;
  });
};

BlazeReact.include = function (template, parentView) {
  // instead of calling template.constructView, we can
  // simply create a blank view and set its template
  // to enable template helper lookups.
  var view = new Blaze.View();
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