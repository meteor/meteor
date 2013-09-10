
UI.Each = Component.extend({
  typeName: 'Each',
  render: function (buf) {
    // do nothing, all in rendered().

    // XXX do something for server-side rendering
  },
  rendered: function () {
    var self = this;

    var cursor = self.get();
    // XXX Avi's code will handle different types of data arg
    if (! cursor)
      return;

    // XXX find `content` via `get()`...
    var content = self.content;
    if (typeof content === 'function')
      content = _.bind(content, self);

    var range = this.dom;

    cursor.observe({
      _no_indices: true,
      addedAt: function (doc, i, beforeId) {
        var id = LocalCollection._idStringify(doc._id);

        var data = doc;
        var dep = new Deps.Dependency;

        var r = new DomRange;
        if (beforeId)
          beforeId = LocalCollection._idStringify(beforeId);
        range.add(id, r, beforeId);

        // XXX dynamically rendering a child component
        // shouldn't be this hard...
        var comp = UI.renderToRange(
          content,
          { data: _extend(
          function () {
            dep.depend();
            return data;
          }, {
            $set: function (v) {
              data = v;
              dep.changed();
            }
          }) },
          r, self);

        r.component = comp;
        // XXX emulate hypothetical
        // node.$ui.data() API
        r.data = function () {
          return data;
        };
      },
      removed: function (doc) {
        range.remove(LocalCollection._idStringify(doc._id));
      },
      movedTo: function (doc, i, j, beforeId) {
        range.moveBefore(
          LocalCollection._idStringify(doc._id),
          beforeId && LocalCollection._idStringify(beforeId));
      },
      changed: function (newDoc) {
        range.get(LocalCollection._idStringify(newDoc._id)).component.data.$set(newDoc);
      }
    });
  }
});
