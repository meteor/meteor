Meteor.render = function (htmlFunc) {
  return Spark.render(function () {
    return Spark.isolate(
      typeof htmlFunc === 'function' ? htmlFunc : function() {
        // non-function argument becomes a constant (non-reactive) string
        return String(htmlFunc);
      });
  });
};

Meteor.renderList = function (cursor, itemFunc, elseFunc) {
  return Spark.render(function () {
    return Spark.list(cursor, function (item) {
      var label = item._id ? idStringify(item._id) : null;
      return Spark.labelBranch(label, function () {
        return Spark.isolate(_.bind(itemFunc, null, item));
      });
    }, function () {
      return elseFunc ? Spark.isolate(elseFunc) : '';
    });
  });
};
