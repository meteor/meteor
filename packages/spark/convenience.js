Meteor.render = function (htmlFunc) {
  return Spark.render(function () {
    return Spark.isolate(
      typeof htmlFunc === 'function' ? htmlFunc : function() {
        // non-function argument becomes a constant (non-reactive) string
        return String(htmlFunc);
      });
  });
};
