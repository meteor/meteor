BlazeReact = {};

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
  if (typeof template === 'function') {
    debugger
  }
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
