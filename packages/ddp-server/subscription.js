export default class Subscription {
    constructor(session, handler, subscriptionId, params, name){
        this._session = session; // type is Session
        /**
         * @summary Access inside the publish function. The incoming [connection](#meteor_onconnection) for this subscription.
         * @locus Server
         * @name  connection
         * @memberOf Subscription
         * @instance
         */
        this.connection = session.connectionHandle; // public API object
      
        this._handler = handler;
      
        // my subscription ID (generated by client, undefined for universal subs).
        this._subscriptionId = subscriptionId;
        // undefined for universal subs
        this._name = name;
      
        this._params = params || [];
      
        // Only named subscriptions have IDs, but we need some sort of string
        // internally to keep track of all subscriptions inside
        // SessionDocumentViews. We use this subscriptionHandle for that.
        if (this._subscriptionId) {
          this._subscriptionHandle = 'N' + this._subscriptionId;
        } else {
          this._subscriptionHandle = 'U' + Random.id();
        }
      
        // has _deactivate been called?
        this._deactivated = false;
      
        // stop callbacks to g/c this sub.  called w/ zero arguments.
        this._stopCallbacks = [];
      
        // the set of (collection, documentid) that this subscription has
        // an opinion about
        this._documents = new Map();
      
        // remember if we are ready.
        this._ready = false;
      
        // Part of the public API: the user of this sub.
      
        /**
         * @summary Access inside the publish function. The id of the logged-in user, or `null` if no user is logged in.
         * @locus Server
         * @memberOf Subscription
         * @name  userId
         * @instance
         */
        this.userId = session.userId;
      
        // For now, the id filter is going to default to
        // the to/from DDP methods on MongoID, to
        // specifically deal with mongo/minimongo ObjectIds.
      
        // Later, you will be able to make this be "raw"
        // if you want to publish a collection that you know
        // just has strings for keys and no funny business, to
        // a ddp consumer that isn't minimongo
      
        this._idFilter = {
          idStringify: MongoID.idStringify,
          idParse: MongoID.idParse
        };
      
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
          "livedata", "subscriptions", 1);
    }

    _runHandler() {
        // XXX should we unblock() here? Either before running the publish
        // function, or before running _publishCursor.
        //
        // Right now, each publish function blocks all future publishes and
        // methods waiting on data from Mongo (or whatever else the function
        // blocks on). This probably slows page load in common cases.
        
        try {
          var res = DDP._CurrentPublicationInvocation.withValue(
            this,
            () => maybeAuditArgumentChecks(
              this._handler, this, EJSON.clone(this._params),
              // It's OK that this would look weird for universal subscriptions,
              // because they have no arguments so there can never be an
              // audit-argument-checks failure.
              "publisher '" + this._name + "'"
            )
          );
        } catch (e) {
          this.error(e);
          return;
        }
    
        // Did the handler call this.error or this.stop?
        if (this._isDeactivated())
          return;
    
        this._publishHandlerResult(res);
      }
    
    _publishHandlerResult(res) {
        // SPECIAL CASE: Instead of writing their own callbacks that invoke
        // this.added/changed/ready/etc, the user can just return a collection
        // cursor or array of cursors from the publish function; we call their
        // _publishCursor method which starts observing the cursor and publishes the
        // results. Note that _publishCursor does NOT call ready().
        //
        // XXX This uses an undocumented interface which only the Mongo cursor
        // interface publishes. Should we make this interface public and encourage
        // users to implement it themselves? Arguably, it's unnecessary; users can
        // already write their own functions like
        //   var publishMyReactiveThingy = function (name, handler) {
        //     Meteor.publish(name, function () {
        //       var reactiveThingy = handler();
        //       reactiveThingy.publishMe();
        //     });
        //   };
    
        
        var isCursor = function (c) {
          return c && c._publishCursor;
        };
        if (isCursor(res)) {
          try {
            res._publishCursor(this);
          } catch (e) {
            this.error(e);
            return;
          }
          // _publishCursor only returns after the initial added callbacks have run.
          // mark subscription as ready.
          this.ready();
        } else if (Array.isArray(res)) {
          // check all the elements are cursors
          if (! _.all(res, isCursor)) {
            this.error(new Error("Publish function returned an array of non-Cursors"));
            return;
          }
          // find duplicate collection names
          // XXX we should support overlapping cursors, but that would require the
          // merge box to allow overlap within a subscription
          var collectionNames = {};
          for (var i = 0; i < res.length; ++i) {
            var collectionName = res[i]._getCollectionName();
            if (_.has(collectionNames, collectionName)) {
              this.error(new Error(
                "Publish function returned multiple cursors for collection " +
                  collectionName));
              return;
            }
            collectionNames[collectionName] = true;
          };
    
          try {
          res.forEach(function (cur) {
              cur._publishCursor(this);
            });
          } catch (e) {
            this.error(e);
            return;
          }
          this.ready();
        } else if (res) {
          // truthy values other than cursors or arrays are probably a
          // user mistake (possible returning a Mongo document via, say,
          // `coll.findOne()`).
          this.error(new Error("Publish function can only return a Cursor or "
                               + "an array of Cursors"));
        }
      }
    
      // This calls all stop callbacks and prevents the handler from updating any
      // SessionCollectionViews further. It's used when the user unsubscribes or
      // disconnects, as well as during setUserId re-runs. It does *NOT* send
      // removed messages for the published objects; if that is necessary, call
      // _removeAllDocuments first.
    _deactivate() {
        
        if (this._deactivated)
          return;
        this._deactivated = true;
        this._callStopCallbacks();
        Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
          "livedata", "subscriptions", -1);
      }
    
    _callStopCallbacks() {
        
        // tell listeners, so they can clean up
        var callbacks = this._stopCallbacks;
        this._stopCallbacks = [];
        callbacks.forEach(function (callback) {
          callback();
        });
      }
    
      // Send remove messages for every document.
      _removeAllDocuments() {
        Meteor._noYieldsAllowed(function () {
          this._documents.forEach(function (collectionDocs, collectionName) {
            collectionDocs.forEach(function (strId) {
              this.removed(collectionName, this._idFilter.idParse(strId));
            });
          });
        });
      }
    
      // Returns a new Subscription for the same session with the same
      // initial creation parameters. This isn't a clone: it doesn't have
      // the same _documents cache, stopped state or callbacks; may have a
      // different _subscriptionHandle, and gets its userId from the
      // session, not from this object.
      _recreate() {
        
        return new Subscription(
          this._session, this._handler, this._subscriptionId, this._params,
          this._name);
      }
    
      /**
       * @summary Call inside the publish function.  Stops this client's subscription, triggering a call on the client to the `onStop` callback passed to [`Meteor.subscribe`](#meteor_subscribe), if any. If `error` is not a [`Meteor.Error`](#meteor_error), it will be [sanitized](#meteor_error).
       * @locus Server
       * @param {Error} error The error to pass to the client.
       * @instance
       * @memberOf Subscription
       */
      error(error) {
        
        if (this._isDeactivated())
          return;
        this._session._stopSubscription(this._subscriptionId, error);
      }
    
      // Note that while our DDP client will notice that you've called stop() on the
      // server (and clean up its _subscriptions table) we don't actually provide a
      // mechanism for an app to notice this (the subscribe onError callback only
      // triggers if there is an error).
    
      /**
       * @summary Call inside the publish function.  Stops this client's subscription and invokes the client's `onStop` callback with no error.
       * @locus Server
       * @instance
       * @memberOf Subscription
       */
      stop() {
        
        if (this._isDeactivated())
          return;
        this._session._stopSubscription(this._subscriptionId);
      }
    
      /**
       * @summary Call inside the publish function.  Registers a callback function to run when the subscription is stopped.
       * @locus Server
       * @memberOf Subscription
       * @instance
       * @param {Function} func The callback function
       */
      onStop(callback) {
        
        callback = Meteor.bindEnvironment(callback, 'onStop callback', this);
        if (this._isDeactivated())
          callback();
        else
          this._stopCallbacks.push(callback);
      }
    
      // This returns true if the sub has been deactivated, *OR* if the session was
      // destroyed but the deferred call to _deactivateAllSubscriptions hasn't
      // happened yet.
      _isDeactivated() {
        return this._deactivated || this._session.inQueue === null;
      }
    
      /**
       * @summary Call inside the publish function.  Informs the subscriber that a document has been added to the record set.
       * @locus Server
       * @memberOf Subscription
       * @instance
       * @param {String} collection The name of the collection that contains the new document.
       * @param {String} id The new document's ID.
       * @param {Object} fields The fields in the new document.  If `_id` is present it is ignored.
       */
      added(collectionName, id, fields) {       
        if (this._isDeactivated())
          return;
        id = this._idFilter.idStringify(id);
        let ids = this._documents.get(collectionName);
        if (ids == null) {
          ids = new Set();
          this._documents.set(collectionName, ids);
        }
        ids.add(id);
        this._session.added(this._subscriptionHandle, collectionName, id, fields);
      }
    
      /**
       * @summary Call inside the publish function.  Informs the subscriber that a document in the record set has been modified.
       * @locus Server
       * @memberOf Subscription
       * @instance
       * @param {String} collection The name of the collection that contains the changed document.
       * @param {String} id The changed document's ID.
       * @param {Object} fields The fields in the document that have changed, together with their new values.  If a field is not present in `fields` it was left unchanged; if it is present in `fields` and has a value of `undefined` it was removed from the document.  If `_id` is present it is ignored.
       */
      changed(collectionName, id, fields) {
        
        if (this._isDeactivated())
          return;
        id = this._idFilter.idStringify(id);
        this._session.changed(this._subscriptionHandle, collectionName, id, fields);
      }
    
      /**
       * @summary Call inside the publish function.  Informs the subscriber that a document has been removed from the record set.
       * @locus Server
       * @memberOf Subscription
       * @instance
       * @param {String} collection The name of the collection that the document has been removed from.
       * @param {String} id The ID of the document that has been removed.
       */
      removed(collectionName, id) { 
        if (this._isDeactivated())
          return;
        id = this._idFilter.idStringify(id);
        // We don't bother to delete sets of things in a collection if the
        // collection is empty.  It could break _removeAllDocuments.
        this._documents.get(collectionName).delete(id);
        this._session.removed(this._subscriptionHandle, collectionName, id);
      }
    
      /**
       * @summary Call inside the publish function.  Informs the subscriber that an initial, complete snapshot of the record set has been sent.  This will trigger a call on the client to the `onReady` callback passed to  [`Meteor.subscribe`](#meteor_subscribe), if any.
       * @locus Server
       * @memberOf Subscription
       * @instance
       */
      ready() {
        if (this._isDeactivated())
          return;
        if (!this._subscriptionId)
          return;  // unnecessary but ignored for universal sub
        if (!this._ready) {
          this._session.sendReady([this._subscriptionId]);
          this._ready = true;
        }
      }
}