import SessionDocumentView from "./session_document_view.js";

/**
 * Represents a client's view of a single collection
 * @param {String} collectionName Name of the collection it represents
 * @param {Object.<String, Function>} sessionCallbacks The callbacks for added, changed, removed
 * @class SessionCollectionView
 */
export default class SessionCollectionView {
  constructor(collectionName, sessionCallbacks) {
    var self = this;
    self.collectionName = collectionName;
    self.documents = {};
    self.callbacks = sessionCallbacks;
  }

  isEmpty() {
    var self = this;
    return _.isEmpty(self.documents);
  }

  diff(previous) {
    var self = this;
    DiffSequence.diffObjects(previous.documents, self.documents, {
      both: _.bind(self.diffDocument, self),

      rightOnly: function (id, nowDV) {
        self.callbacks.added(self.collectionName, id, nowDV.getFields());
      },

      leftOnly: function (id, prevDV) {
        self.callbacks.removed(self.collectionName, id);
      }
    });
  }

  diffDocument(id, prevDV, nowDV) {
    var self = this;
    var fields = {};
    DiffSequence.diffObjects(prevDV.getFields(), nowDV.getFields(), {
      both: function (key, prev, now) {
        if (!EJSON.equals(prev, now))
          fields[key] = now;
      },
      rightOnly: function (key, now) {
        fields[key] = now;
      },
      leftOnly: function(key, prev) {
        fields[key] = undefined;
      }
    });
    self.callbacks.changed(self.collectionName, id, fields);
  }

  added(subscriptionHandle, id, fields) {
    var self = this;
    var docView = self.documents[id];
    var added = false;
    if (!docView) {
      added = true;
      docView = new SessionDocumentView();
      self.documents[id] = docView;
    }
    docView.existsIn[subscriptionHandle] = true;
    var changeCollector = {};
    _.each(fields, function (value, key) {
      docView.changeField(
        subscriptionHandle, key, value, changeCollector, true);
    });
    if (added)
      self.callbacks.added(self.collectionName, id, changeCollector);
    else
      self.callbacks.changed(self.collectionName, id, changeCollector);
  }

  changed(subscriptionHandle, id, changed) {
    var self = this;
    var changedResult = {};
    var docView = self.documents[id];
    if (!docView)
      throw new Error("Could not find element with id " + id + " to change");
    _.each(changed, function (value, key) {
      if (value === undefined)
        docView.clearField(subscriptionHandle, key, changedResult);
      else
        docView.changeField(subscriptionHandle, key, value, changedResult);
    });
    self.callbacks.changed(self.collectionName, id, changedResult);
  }

  removed(subscriptionHandle, id) {
    var self = this;
    var docView = self.documents[id];
    if (!docView) {
      var err = new Error("Removed nonexistent document " + id);
      throw err;
    }
    delete docView.existsIn[subscriptionHandle];
    if (_.isEmpty(docView.existsIn)) {
      // it is gone from everyone
      self.callbacks.removed(self.collectionName, id);
      delete self.documents[id];
    } else {
      var changed = {};
      // remove this subscription from every precedence list
      // and record the changes
      _.each(docView.dataByKey, function (precedenceList, key) {
        docView.clearField(subscriptionHandle, key, changed);
      });

      self.callbacks.changed(self.collectionName, id, changed);
    }
  }
}
