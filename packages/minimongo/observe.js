LocalCollection._observeFromObserveChanges = function (cursor, callbacks) {
  var transform = cursor.getTransform();
  if (!transform)
    transform = function (doc) {return doc;};
  if (callbacks.addedAt && callbacks.added)
    throw new Error("Please specify only one of added() and addedAt()");
  if (callbacks.changedAt && callbacks.changed)
    throw new Error("Please specify only one of changed() and changedAt()");
  if (callbacks.removed && callbacks.removedAt)
    throw new Error("Please specify only one of removed() and removedAt()");
  if (callbacks.addedAt || callbacks.movedTo ||
      callbacks.changedAt || callbacks.removedAt)
    return LocalCollection._observeOrderedFromObserveChanges(cursor, callbacks, transform);
  else
    return LocalCollection._observeUnorderedFromObserveChanges(cursor, callbacks, transform);
};

LocalCollection._observeUnorderedFromObserveChanges =
    function (cursor, callbacks, transform) {
  var docs = {};
  var suppressed = !!callbacks._suppress_initial;
  var handle = cursor.observeChanges({
    added: function (id, fields) {
      var strId = LocalCollection._idStringify(id);
      var doc = EJSON.clone(fields);
      doc._id = id;
      docs[strId] = doc;
      suppressed || callbacks.added && callbacks.added(transform(doc));
    },
    changed: function (id, fields) {
      var strId = LocalCollection._idStringify(id);
      var doc = docs[strId];
      var oldDoc = EJSON.clone(doc);
      // writes through to the doc set
      LocalCollection._applyChanges(doc, fields);
      suppressed || callbacks.changed && callbacks.changed(transform(doc), transform(oldDoc));
    },
    removed: function (id) {
      var strId = LocalCollection._idStringify(id);
      var doc = docs[strId];
      delete docs[strId];
      suppressed || callbacks.removed && callbacks.removed(transform(doc));
    }
  });
  suppressed = false;
  return handle;
};

LocalCollection._observeOrderedFromObserveChanges =
    function (cursor, callbacks, transform) {
  var docs = new OrderedDict(LocalCollection._idStringify);
  var suppressed = !!callbacks._suppress_initial;
  // The "_no_indices" option sets all index arguments to -1
  // and skips the linear scans required to generate them.
  // This lets observers that don't need absolute indices
  // benefit from the other features of this API --
  // relative order, transforms, and applyChanges -- without
  // the speed hit.
  var indices = !callbacks._no_indices;
  var handle = cursor.observeChanges({
    addedBefore: function (id, fields, before) {
      var doc = EJSON.clone(fields);
      doc._id = id;
      // XXX could `before` be a falsy ID?  Technically
      // idStringify seems to allow for them -- though
      // OrderedDict won't call stringify on a falsy arg.
      docs.putBefore(id, doc, before || null);
      if (!suppressed) {
        if (callbacks.addedAt) {
          var index = indices ? docs.indexOf(id) : -1;
          callbacks.addedAt(transform(EJSON.clone(doc)),
                            index, before);
        } else if (callbacks.added) {
          callbacks.added(transform(EJSON.clone(doc)));
        }
      }
    },
    changed: function (id, fields) {
      var doc = docs.get(id);
      if (!doc)
        throw new Error("Unknown id for changed: " + id);
      var oldDoc = EJSON.clone(doc);
      // writes through to the doc set
      LocalCollection._applyChanges(doc, fields);
      if (callbacks.changedAt) {
        var index = indices ? docs.indexOf(id) : -1;
        callbacks.changedAt(transform(EJSON.clone(doc)),
                            transform(oldDoc), index);
      } else if (callbacks.changed) {
        callbacks.changed(transform(EJSON.clone(doc)),
                          transform(oldDoc));
      }
    },
    movedBefore: function (id, before) {
      var doc = docs.get(id);
      var from;
      // only capture indexes if we're going to call the callback that needs them.
      if (callbacks.movedTo)
        from = indices ? docs.indexOf(id) : -1;
      docs.moveBefore(id, before || null);
      if (callbacks.movedTo) {
        var to = indices ? docs.indexOf(id) : -1;
        callbacks.movedTo(transform(EJSON.clone(doc)), from, to,
                          before || null);
      } else if (callbacks.moved) {
        callbacks.moved(transform(EJSON.clone(doc)));
      }

    },
    removed: function (id) {
      var doc = docs.get(id);
      var index;
      if (callbacks.removedAt)
        index = indices ? docs.indexOf(id) : -1;
      docs.remove(id);
      callbacks.removedAt && callbacks.removedAt(transform(doc), index);
      callbacks.removed && callbacks.removed(transform(doc));
    }
  });
  suppressed = false;
  return handle;
};
