UI.Each2 = Component.extend({
  typeName: 'Each',
  init: function () {
    // don't keep `this.data` around so that `{{..}}` skips over this
    // component
    this.sequence = this.data;
    delete this.data;
  },
  // xcxc -> parented
  rendered: function () {
    var self = this.__component__;

    // XXX find `content` via `get()`...
    // XXX content kind reactively changes?
    var content = self.__content;
    if (typeof content === 'function')
      content = _.bind(content, self);
    var elseContent = self.__elseContent;
    if (typeof elseContent === 'function')
      elseContent = _.bind(elseContent, self);

    var range = self.dom;

    // if there is an else clause, keep track of the number of
    // rendered items.  use this to display the else clause when count
    // becomes zero, and remove it when count becomes positive.
    var itemCount = 0;
    var addToCount = function(delta) {
      if (!elseContent) // if no else, no need to keep track of count
        return;

      if (itemCount + delta < 0)
        throw new Error("count should never become negative");

      if (itemCount === 0) {
        // remove else clause
        range.removeAll();
      }
      itemCount += delta;
      if (itemCount === 0) {
        UI.materialize(elseContent(), range, null, self);
      }
    };

    ObserveSequence.observe(function () {
      return self.get('sequence');
    }, {
      addedAt: function (id, item, i, beforeId) {
        addToCount(1);
        id = LocalCollection._idStringify(id);

        var data = item;
        var dep = new Deps.Dependency;

        // function to become `comp.data`
        var dataFunc = function () {
          dep.depend();
          return data;
        };
        // Storing `$set` on `comp.data` lets us
        // access it from `changed`.
        dataFunc.$set = function (v) {
          data = v;
          dep.changed();
        };

        if (beforeId)
          beforeId = LocalCollection._idStringify(beforeId);

        var renderedItem = UI.render2(content().withData(dataFunc), self);
        range.add(id, renderedItem, beforeId);
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

    // on initial render, display the else clause if no items
    addToCount(0);
  }
});
