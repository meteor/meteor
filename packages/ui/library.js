// @export If
If = Component.extend({
  init: function () {
    if (! this.getArg('body'))
      throw new Error("If requires a body");
  },
  render: function (buf) {
    if (this.getArg('data'))
      buf.component(this.getArg('body').create());
    else if (this.getArg('else'))
      buf.component(this.getArg('else'));
  }
});

// @export Each
Each = Component.extend({

  // XXX what is init() good for if render lets you reactively
  // depend on args, but init doesn't?  (you can access them
  // but your code only ever runs once)

  render: function (buf) {
    var self = this;
    // XXX support arrays too.
    // For now, we assume the data is a database cursor.
    var cursor = self.getArg('data');

    // OrderedDict from id string or object (which is
    // stringified internally by the dict) to untransformed
    // document.
    self.items = new OrderedDict(idStringify);
    var items = self.items;

    // Templates should have access to data and methods added by the
    // transformer, but observeChanges doesn't transform, so we have to do
    // it here.
    //
    // NOTE: this is a little bit of an abstraction violation. Ideally,
    // the only thing we should know about Minimongo is the contract of
    // observeChanges. In theory, we could allow anything that implements
    // observeChanges to be passed to us.
    var transformedDoc = function (doc) {
      if (cursor.getTransform && cursor.getTransform())
        return cursor.getTransform()(EJSON.clone(doc));
      return doc;
    };

    // because we're in render(), rebuild or destroy will
    // stop this handle.
    self.cursorHandle = cursor.observeChanges({
      addedBefore: function (id, item, beforeId) {
        var doc = EJSON.clone(item);
        doc._id = id;
        items.putBefore(id, doc, beforeId);

        if (self.stage === Component.BUILT) {
          var tdoc = transformedDoc(doc);
          self.itemAddedBefore(id, tdoc, beforeId);
        }
      },
      removed: function (id) {
        items.remove(id);

        if (self.stage === Component.BUILT)
          self.itemRemoved(id);
      },
      movedBefore: function (id, beforeId) {
        items.moveBefore(id, beforeId);

        if (self.stage === Component.BUILT)
          self.itemMovedBefore(id, beforeId);
      },
      changed: function (id, fields) {
        var doc = items.get(id);
        if (! doc)
          throw new Error("Unknown id for changed: " + idStringify(id));
        applyChanges(doc, fields);

        if (self.stage === Component.BUILT) {
          var tdoc = transformedDoc(doc);
          self.itemChanged(id, tdoc);
        }
      }
    });

    if (items.empty()) {
      buf.component(function () {
        return (self.getArg('else') || EmptyComponent).create(
          { data: self.getArg('data') });
      }, { key: 'else' });
    } else {
      items.forEach(function (doc, id) {
        var tdoc = transformedDoc(doc);

        buf.component(function () {
          return self.getArg('body').create({ data: tdoc });
        }, { key: self._itemChildId(id) });
      });
    }
  },

  _itemChildId: function (id) {
    return 'item:' + idStringify(id);
  },
  itemAddedBefore: function (id, doc, beforeId) {
    var self = this;
    if (self.stage !== Component.BUILT)
      throw new Error("Component must be built");

    var childId = self._itemChildId(id);
    var comp = self.getArg('body').create({data: doc});

    if (self.items.size() === 1) {
      // was empty
      self.replaceChild('else', comp, childId);
    } else {
      var beforeNode =
            (beforeId ?
             self.children[self._itemChildId(beforeId)].firstNode() :
             (self.lastNode().nextSibling || null));
      var parentNode = self.parentNode();

      self.addChild(childId, comp, parentNode, beforeNode);
    }
  },
  itemRemoved: function (id) {
    var self = this;
    if (self.stage !== Component.BUILT)
      throw new Error("Component must be built");

    var childId = self._itemChildId(id);
    if (self.items.size() === 0) {
      // made empty
      var elseClass = self.getArg('else') || EmptyComponent;
      var comp = elseClass.create({data: self.getArg('data')});
      self.replaceChild(childId, comp, 'else');
    } else {
      self.removeChild(childId);
    }
  },
  itemMovedBefore: function (id, beforeId) {
    var self = this;
    if (self.stage !== Component.BUILT)
      throw new Error("Component must be built");

    if (self.items.size() === 1)
      return; // move is meaningless anyway

    var comp = self.children[self._itemChildId(id)];

    var beforeNode =
          (beforeId ?
           self.children[self._itemChildId(beforeId)].firstNode() :
           (self.lastNode().nextSibling || null));
    var parentNode = self.parentNode();

    comp.detach();
    comp.attach(parentNode, beforeNode);
  },
  itemChanged: function (id, doc) {
    var self = this;
    if (self.stage !== Component.BUILT)
      throw new Error("Component must be built");

    self.children[self._itemChildId(id)].update({data: doc});
  }
});

// Function equal to LocalCollection._idStringify, or the identity
// function if we don't have LiveData.  Converts item keys (i.e. DDP
// keys) to strings for storage in an OrderedDict.
var idStringify;

// XXX not clear if this is the right way to do a weak dependency
// now, on the linker branch
if (typeof LocalCollection !== 'undefined') {
  idStringify = function (id) {
    if (id === null)
      return id;
    else
      return LocalCollection._idStringify(id);
  };
} else {
  idStringify = function (id) { return id; };
}

// XXX duplicated code from minimongo.js.
var applyChanges = function (doc, changeFields) {
  _.each(changeFields, function (value, key) {
    if (value === undefined)
      delete doc[key];
    else
      doc[key] = value;
  });
};
