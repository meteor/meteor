import { maybeAuditArgumentChecks } from './utils';

export class Subscription {
  /**
   * @summary The server's side of a subscription
   * @class Subscription
   * @instanceName this
   * @showInstanceName true
   */
  constructor(session, handler, subscriptionId, params, name) {
    this._session = session; // type is Session

    /**
     * @summary Access inside the publish function. The incoming connection for this subscription.
     * @locus Server
     * @name connection
     * @memberOf Subscription
     * @instance
     */
    this.connection = session.connectionHandle;
    
    this._handler = handler;
    this._subscriptionId = subscriptionId;
    this._name = name;
    this._params = params || [];

    // Generate subscription handle
    this._subscriptionHandle = subscriptionId ? 
      `N${subscriptionId}` : 
      `U${Random.id()}`;

    this._deactivated = false;
    this._stopCallbacks = [];
    this._documents = new Map();
    this._ready = false;

    /**
     * @summary Access inside the publish function. The id of the logged-in user, or `null` if no user is logged in.
     * @locus Server
     * @memberOf Subscription
     * @instance
     */
    this.userId = session.userId;

    this._idFilter = {
      idStringify: MongoID.idStringify,
      idParse: MongoID.idParse
    };

    Package['facts-base']?.Facts.incrementServerFact(
      "livedata", "subscriptions", 1
    );
  }

  async _runHandler() {
    if (!this.unblock) {
      this.unblock = () => {};
    }

    let resultOrThenable = null;
    try {
      resultOrThenable = await DDP._CurrentPublicationInvocation.withValue(
        this,
        () => maybeAuditArgumentChecks(
          this._handler,
          this,
          EJSON.clone(this._params),
          `publisher '${this._name}'`
        ),
        { name: this._name }
      );
    } catch (e) {
      this.error(e);
      return;
    }

    if (this._isDeactivated()) return;

    try {
      if (resultOrThenable?.then) {
        await this._publishHandlerResult(await resultOrThenable);
      } else {
        await this._publishHandlerResult(resultOrThenable);
      }
    } catch (e) {
      this.error(e);
    }
  }

  async _publishHandlerResult(res) {
    const isCursor = c => c && c._publishCursor;

    if (isCursor(res)) {
      try {
        await res._publishCursor(this);
        this.ready();
      } catch (e) {
        this.error(e);
        return;
      }
    } else if (Array.isArray(res)) {
      if (!res.every(isCursor)) {
        this.error(new Error("Publish function returned an array of non-Cursors"));
        return;
      }

      const collectionNames = new Set();
      for (const cursor of res) {
        const collectionName = cursor._getCollectionName();
        if (collectionNames.has(collectionName)) {
          this.error(new Error(
            `Publish function returned multiple cursors for collection ${collectionName}`
          ));
          return;
        }
        collectionNames.add(collectionName);
      }

      try {
        await Promise.all(res.map(cur => cur._publishCursor(this)));
        this.ready();
      } catch (e) {
        this.error(e);
      }
    } else if (res) {
      this.error(new Error(
        "Publish function can only return a Cursor or an array of Cursors"
      ));
    }
  }

  _deactivate() {
    if (this._deactivated) return;
    
    this._deactivated = true;
    this._callStopCallbacks();
    Package['facts-base']?.Facts.incrementServerFact(
      "livedata", "subscriptions", -1
    );
  }

  _callStopCallbacks() {
    const callbacks = [...this._stopCallbacks];
    this._stopCallbacks = [];
    callbacks.forEach(callback => callback());
  }

  _removeAllDocuments() {
    Meteor._noYieldsAllowed(() => {
      this._documents.forEach((collectionDocs, collectionName) => {
        collectionDocs.forEach(strId => {
          this.removed(collectionName, this._idFilter.idParse(strId));
        });
      });
    });
  }

  _recreate() {
    return new Subscription(
      this._session,
      this._handler,
      this._subscriptionId,
      this._params,
      this._name
    );
  }

  /**
   * @summary Call inside the publish function. Stops this client's subscription with error.
   * @locus Server
   * @param {Error} error The error to pass to the client.
   */
  error(error) {
    if (this._isDeactivated()) return;
    this._session._stopSubscription(this._subscriptionId, error);
  }

  /**
   * @summary Call inside the publish function. Stops this client's subscription.
   * @locus Server
   */
  stop() {
    if (this._isDeactivated()) return;
    this._session._stopSubscription(this._subscriptionId);
  }

  /**
   * @summary Register a callback for when subscription is stopped
   * @locus Server
   * @param {Function} callback The callback function
   */
  onStop(callback) {
    callback = Meteor.bindEnvironment(
      callback,
      'onStop callback',
      this
    );
    
    if (this._isDeactivated()) {
      callback();
    } else {
      this._stopCallbacks.push(callback);
    }
  }

  _isDeactivated() {
    return this._deactivated || this._session.inQueue === null;
  }

  /**
   * @summary Inform subscriber about added document
   * @locus Server
   * @param {String} collection Collection name
   * @param {String} id Document ID
   * @param {Object} fields Document fields
   */
  added(collectionName, id, fields) {
    if (this._isDeactivated()) return;
    
    id = this._idFilter.idStringify(id);

    if (this._session.server.getPublicationStrategy(collectionName).doAccountingForCollection) {
      const ids = this._documents.get(collectionName) || new Set();
      if (!this._documents.has(collectionName)) {
        this._documents.set(collectionName, ids);
      }
      ids.add(id);
    }

    this._session.added(this._subscriptionHandle, collectionName, id, fields);
  }

  /**
   * @summary Inform subscriber about changed document
   * @locus Server
   * @param {String} collection Collection name
   * @param {String} id Document ID
   * @param {Object} fields Changed fields
   */
  changed(collectionName, id, fields) {
    if (this._isDeactivated()) return;
    
    id = this._idFilter.idStringify(id);
    this._session.changed(this._subscriptionHandle, collectionName, id, fields);
  }

  /**
   * @summary Inform subscriber about removed document
   * @locus Server
   * @param {String} collection Collection name
   * @param {String} id Document ID
   */
  removed(collectionName, id) {
    if (this._isDeactivated()) return;
    
    id = this._idFilter.idStringify(id);

    if (this._session.server.getPublicationStrategy(collectionName).doAccountingForCollection) {
      this._documents.get(collectionName)?.delete(id);
    }

    this._session.removed(this._subscriptionHandle, collectionName, id);
  }

  /**
   * @summary Inform subscriber that initial snapshot is complete
   * @locus Server
   */
  ready() {
    if (this._isDeactivated() || !this._subscriptionId) return;
    
    if (!this._ready) {
      this._session.sendReady([this._subscriptionId]);
      this._ready = true;
    }
  }
}