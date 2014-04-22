// THIS CODE SHOULD GO AWAY WHEN BLAZE REFACTOR IS COMPLETE

callReactiveFunction = function (func) {
  var result;
  var cc = Deps.currentComputation;
  var h = Deps.autorun(function (c) {
    result = func();
  });
  h.onInvalidate(function () {
    if (cc)
      cc.invalidate();
  });
  if (Deps.active) {
    Deps.onInvalidate(function () {
      h.stop();
      func.stop && func.stop();
    });
  } else {
    h.stop();
    func.stop && func.stop();
  }
  return result;
};

stopWithLater = function (instance) {
  if (instance.materialized && instance.materialized.isWith) {
    if (Deps.active) {
      instance.materialized();
    } else {
      if (instance.data) // `UI.With`
        instance.data.stop();
      else if (instance.v) // `Spacebars.With`
        instance.v.stop();
    }
  }
};

UI.EvaluatingVisitor = HTML.TransformingVisitor.extend({
  visitObject: function (node, parentComponent) {
    if (typeof node.instantiate === 'function') {
      // component
      var instance = node.instantiate(parentComponent || null);
      var content = instance.render('STATIC');
      stopWithLater(instance);
      return this.visit(content, instance);
    }

    // this will throw an error; other objects are not allowed!
    return HTML.TransformingVisitor.prototype.visitObject.call(
      this, node, parentComponent);
  },
  visitFunction: function (func, parentComponent) {
    return this.visit(callReactiveFunction(func), parentComponent);
  },
  visitAttributes: function (attrs, parentComponent) {
    if (typeof attrs === 'function')
      attrs = attrs();

    // call super (e.g. for case where `attrs` is an array)
    return HTML.TransformingVisitor.prototype.visitAttributes.call(
      this, attrs, parentComponent);
  }
});

// Expand all functions and components
UI.evaluate = function (content, parentComponent) {
  return (new UI.EvaluatingVisitor).visit(content, parentComponent);
};

UI.evaluateAttributes = function (attrs, parentComponent) {
  return (new UI.EvaluatingVisitor).visitAttributes(attrs, parentComponent);
};

UI.toHTML = function (content, parentComponent) {
  return HTML.toHTML(UI.evaluate(content, parentComponent));
};

UI.toText = function (content, textMode, parentComponent) {
  return HTML.toText(UI.evaluate(content, parentComponent), textMode);
};