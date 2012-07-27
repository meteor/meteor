// XXX figure out good liverange tag names. should they be symbolic constants?
// in liverange-land they should probably start with "_"?


Spark = Spark || {};

Spark._currentRenderer = new Meteor.EnvironmentVariable;

Spark._Renderer = function () {
  // Map from annotation ID to an annotation function, which is called
  // at render time and receives (startNode, endNode.)
  this.annotations = {};
};

_.extend(Spark._Renderer.prototype, {
  createId: function () {
    var id = "";
    var chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (var i = 0; i < 8; i++) {
      id += hexDigits.substr(Math.floor(Meteor.random() * 64), 1);
    }
    return id;
  },

  // what can be a function that takes a LiveRange, or just a set of
  // attributes to add to the liverange.
  annotate: function (html, tag, what) {
    var id = tag + "-" + this.createId();
    this.annotations[id] = function (start, end) {
      var range = new LiveRange(tag, start, end);
      if (what instanceof Function)
        what(range);
      else
        _.extend(range, what);
    }

    return "<$" + id + ">" + html + "</$" + id + ">";
  }
});

Spark.render = function (htmlFunc) {
  var renderer = new Spark.Renderer;
  var html = Spark.currentRenderer.withValue(renderer, function () {
    return Spark.barrier(htmlFunc);
  });

  // XXX turn html into DOM and attach liveranges


  // HERE
  //
  // - Move LiveRange to global scope
  // - Create DomUtils package (or something like that)
  // - First thing in DomUtils is htmlToFragment from innerhtml.js
  //   - Later, will add stuff from domutils.js
  //   - _rangeToHtml will go in LiveRange (possibly the test helpers)

};

Spark.setContext = function (html, context) {
  var renderer = Spark._currentRenderer.get();
  if (!renderer)
    return html;

  return renderer.annotate(html, "_context", { context: context });
};

Spark.getContext = function (node) {
  var range = LiveRange.findRange("_context", node);
  return range && range.context;
}

Spark.barrier = function (htmlFunc) {
  var renderer = Spark._currentRenderer.get();
  if (!renderer)
    return htmlFunc();

  var ctx = new Meteor.deps.Context;
  var html =
    renderer.annotate(ctx.run(htmlFunc), "_barrier", function (range) {
      ctx.on_invalidate(function () {
        // XXX update with patching
      });
    });

  return html;
};
