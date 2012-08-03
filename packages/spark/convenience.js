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
      var html = Spark.isolate(_.bind(itemFunc, null, item));
      if (item._id)
        html = Spark.labelBranch(item._id, html);
      return html;
    }, function () {
      return elseFunc ? Spark.isolate(elseFunc) : '';
    });
  });
};
