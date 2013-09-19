
UI.Each = Component.extend({
  typeName: 'Each',
  render: function (buf) {
    // do nothing, all in rendered().

    // XXX do something for server-side rendering
  },
  rendered: function () {
    var self = this.__component__;

    // XXX find `content` via `get()`...
    // XXX content kind reactively changes?
    var content = self.content;
    if (typeof content === 'function')
      content = _.bind(content, self);
    var elseContent = self.elseContent;
    if (typeof elseContent === 'function')
      elseContent = _.bind(elseContent, self);

    var range = self.dom;

    // if there is an else clause, keep track of the number of
    // rendered items.  use this to display the else clause when count
    // becomes zero, and remove it when count becomes positive.
    var count = 0;
    var addToCount = function(diff) {
      if (!elseContent) // if no else, no need to keep track of count
        return;

      if (count + diff < 0)
        throw new Error("count should never become negative");

      if (count === 0) {
        // remove else clause
        range.removeAll();
      }
      count += diff;
      if (count === 0) {
        // display else clause
        range.add(null, UI.render(elseContent, {}, self), null);
      }
    };

    ObserveSequence.observe(function () {
      return self.get();
    }, {
      addedAt: function (id, item, i, beforeId) {
        addToCount(1);
        id = LocalCollection._idStringify(id);

        var data = item;
        var dep = new Deps.Dependency;

        // XXX dynamically rendering a child component
        // shouldn't be this hard...
        var comp = UI.render(
          content,
          // XXX emulate hypothetical
          // node.$ui.data() API
          { data: _extend(
          function () {
            dep.depend();
            return data;
          }, {
            $set: function (v) {
              data = v;
              dep.changed();
            }
          }) }, self);

        if (beforeId)
          beforeId = LocalCollection._idStringify(beforeId);
        range.add(id, comp, beforeId);
      },
      removed: function (id, item) {
        addToCount(-1);
        range.remove(LocalCollection._idStringify(id));
      },
      movedTo: function (id, item, i, j, beforeId) {
        range.moveBefore(
          LocalCollection._idStringify(id),
          beforeId && LocalCollection._idStringify(beforeId));
      },
      changed: function (id, newItem) {
        range.get(LocalCollection._idStringify(id)).data.$set(newItem);
      }
    });

    addToCount(0); // display the else clause if no displayed items
  }
});
