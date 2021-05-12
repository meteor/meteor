import SessionDocumentView from "./session_document_view";

export default class SessionCollectionView {
    constructor(collectionName, sessionCallbacks){
        this.collectionName = collectionName;
        this.documents = new Map();
        this.callbacks = sessionCallbacks;
    }

  static isEmpty() {
    return this.documents.size === 0;
  }

  static diff(previous) {
    DiffSequence.diffMaps(previous.documents, this.documents, {
      both: _.bind(this.diffDocument, this),

      rightOnly(id, nowDV) {
        this.callbacks.added(this.collectionName, id, nowDV.getFields());
      },

      leftOnly(id, prevDV) {
        this.callbacks.removed(this.collectionName, id);
      }
    });
  }

  static diffDocument(id, prevDV, nowDV) { 
    const fields = DiffSequence.makeChangedFields(prevDV.getFields(), nowDV.getFields());
    // DiffSequence.diffObjects(prevDV.getFields(), nowDV.getFields(), {
    //   both(key, prev, now) {
    //     if (!EJSON.equals(prev, now))
    //       fields[key] = now;
    //   },
    //   rightOnly(key, now) {
    //     fields[key] = now;
    //   },
    //   leftOnly: function(key, prev) {
    //     fields[key] = undefined;
    //   }
    // });
    this.callbacks.changed(this.collectionName, id, fields);
  }

  static added(subscriptionHandle, id, fields) {
    var docView = this.documents.id;
    var added = false;
    if (!docView) {
      added = true;
      docView = new SessionDocumentView();
      this.documents.set(id, docView);
    }
    docView.existsIn.add(subscriptionHandle);
    var changeCollector = {};
    _.each(fields, function (value, key) {
      docView.changeField(
        subscriptionHandle, key, value, changeCollector, true);
    });
    if (added)
      this.callbacks.added(this.collectionName, id, changeCollector);
    else
      this.callbacks.changed(this.collectionName, id, changeCollector);
  }

  static changed(subscriptionHandle, id, changed) {
    const docView = this.documents.id;

    if (!docView)
      throw new Error("Could not find element with id " + id + " to change");
      let changedResult = {};

      changed.forEach(function (value, key) {

      value === undefined ?
        docView.clearField(subscriptionHandle, key, changedResult)
      :
        docView.changeField(subscriptionHandle, key, value, changedResult);

    });

    this.callbacks.changed(this.collectionName, id, changedResult);
  }

  static removed(subscriptionHandle, id) {
    var docView = this.documents.id;

    if (!docView)
      throw new Error("Removed nonexistent document " + id);

    docView.existsIn.delete(subscriptionHandle);

    
    if (docView.existsIn.size === 0) {
      // it is gone from everyone
      this.callbacks.removed(this.collectionName, id);
      this.documents.delete(id);
    } else {
      let changed = {};
      // remove this subscription from every precedence list
      // and record the changes
      docView.dataByKey.forEach(function (precedenceList, key) {
        docView.clearField(subscriptionHandle, key, changed);
      });

      this.callbacks.changed(this.collectionName, id, changed);
    }
  }
}