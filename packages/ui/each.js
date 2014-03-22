UI.EachImpl = Component.extend({
  typeName: 'Each',
  render: function (modeHint) {
    var self = this;
    var content = self.__content;
    var elseContent = self.__elseContent;

    if (modeHint === 'STATIC') {
      // This is a hack.  The caller gives us a hint if the
      // value we return will be static (in HTML or text)
      // or dynamic (materialized DOM).  The dynamic path
      // returns `null` and then we populate the DOM from
      // the `materialized` callback.
      //
      // It would be much cleaner to always return the same
      // value here, and to have that value be some special
      // object that encapsulates the logic for populating
      // the #each using a mode-agnostic interface that
      // works for HTML, text, and DOM.  Alternatively, we
      // could formalize the current pattern, e.g. defining
      // a method like component.populate(domRange) and one
      // like renderStatic() or even renderHTML / renderText.
      var parts = _.map(
        ObserveSequence.fetch(self.__sequence()),
        function (item) {
          return content.extend({data: function () {
            return item;
          }});
        });

      if (parts.length) {
        return parts;
      } else {
        return elseContent;
      }
      return parts;
    } else {
      return null;
    }
  },
  materialized: function () {
    var self = this;

    var range = self.dom;

    var content = self.__content;
    var elseContent = self.__elseContent;

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
        UI.materialize(elseContent, range, null, self);
      }
    };

    this.observeHandle = ObserveSequence.observe(function () {
      return self.__sequence();
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

        var renderedItem = UI.render(content.extend({data: dataFunc}), self);
        range.add(id, renderedItem.dom, beforeId);
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
        range.get(LocalCollection._idStringify(id)).component.data.$set(newItem);
      }
    });

    // on initial render, display the else clause if no items
    addToCount(0);
  },
  destroyed: function () {
    if (this.__component__.observeHandle)
      this.__component__.observeHandle.stop();
  }
});
