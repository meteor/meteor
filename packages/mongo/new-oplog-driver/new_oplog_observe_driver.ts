import { LocalCollection } from 'meteor/minimongo';
import { Tracker } from 'meteor/tracker';

import { MongoIDMap } from './mongo_id_map';
import ObservableCollection from './observable_collection';
import { NewOplogTailing } from './new_oplog_tailing';
import { getDedicatedChannel, extractIdsFromSelector } from './utils';
import { EJSON } from '../../ejson/ejson';
import { listenAll } from '../mongo_driver';

let currentId = 0;

type StrategyType = 'DEFAULT' | 'LIMIT_SORT' | 'DEDICATED_CHANNELS';
export type OplogEventType = 'INSERT' | 'UPDATE' | 'REMOVE';

export class NewOplogObserveDriver {
  options: {
    multiplexer: any;
    matcher: any;
    sorter: any;
    cursorDescription: any;
    limit?: number;
    sort?: any;
  };
  _usesOplog = true
  oplogHandle: NewOplogTailing;
  observableCollection: ObservableCollection | null = null;
  private _id: number;
  private _cursorDescription: any;
  _multiplexer: any;
  private _onlyContainsDirectIdSelector = false;
  private _invalidationCrossbarListener?: { stop: () => void };
  _stopped = false;
  strategy: StrategyType;
  channels: string[];
  wrapWithInitialEnvironment =  Meteor.bindEnvironment(
      function (callback) {
        return callback();
      },
      function (err) {
        Meteor._debug("Error in NewOplogObserveDriver Callback", err);
      }
    );


  constructor(options: any) {
    this._id = currentId;
    currentId++;

    this.options = options;
    const { cursorDescription } = options;
    this.oplogHandle = options.mongoHandle._oplogHandle;

    this._cursorDescription = options.cursorDescription;
    this._multiplexer = options.multiplexer;

    if (options.limit && !options.sort) {
      options.sort = { _id: 1 };
    }
    if (cursorDescription.options.limit && cursorDescription.options.sort) {
      this.strategy = 'LIMIT_SORT';
      this.channels = [cursorDescription.collectionName];
    } else if (cursorDescription.selector?._id) {
      this.strategy = 'DEDICATED_CHANNELS';
      const ids = extractIdsFromSelector(cursorDescription.selector);
      this.channels = ids.map((id) =>
        getDedicatedChannel(cursorDescription.collectionName, id)
      );
      this._onlyContainsDirectIdSelector =
        Object.keys(cursorDescription.selector).length === 1;
    } else {
      this.strategy = 'DEFAULT';
      this.channels = [cursorDescription.collectionName];
    }
  }

  async _init() {
    this.observableCollection = new ObservableCollection(this.options);
    await this.observableCollection.setupCollection();

    // This is to mitigate the issue when we run init the first time on a subscription
    // And if you are using packages like reactive-publish
    // Because inside here we do a .find().fetch(), and that's considered reactive
    await Tracker.nonreactive(async () => {
      await this.observableCollection!.init();
    });

    this.oplogHandle.attach(this);

    this._invalidationCrossbarListener = await listenAll(this._cursorDescription, () => {
      // If we're not in a pre-fire write fence, we don't have to do anything.
      const fence = DDPServer._getCurrentFence();
      if (!fence || fence.fired) return;

      if (fence._oplogObserveDrivers) {
        fence._oplogObserveDrivers[this._id] = this;
        return;
      }

      fence._oplogObserveDrivers = {};
      fence._oplogObserveDrivers[this._id] = this;

      fence.onBeforeFire(async () => {
        const drivers = fence._oplogObserveDrivers;
        delete fence._oplogObserveDrivers;

        // This fence cannot fire until we've caught up to "this point" in the
        // oplog, and all observers made it back to the steady state.
        await this.oplogHandle.waitUntilCaughtUp();
        for (const driver of Object.values(drivers)) {
          if (driver._stopped) continue;

          const write = await fence.beginWrite();
          await driver._multiplexer.onFlush(write.committed);
        }
      });
    });
  }

  stop() {
    this._stopped = true;
    this.oplogHandle.detach(this);
    this.observableCollection = null;
    this._invalidationCrossbarListener?.stop();
    Package['facts-base'] &&
      Package['facts-base'].Facts.incrementServerFact(
        'mongo-livedata',
        'observe-drivers-oplog',
        -1
      );
  }

  async reload() {
    const { store, cursor } = this.observableCollection!;
    const freshData = await cursor.fetchAsync();
    const newStore = new MongoIDMap();
    freshData.forEach((doc: any) => newStore.set(doc._id, doc));

    await store.compareWith(newStore, {
      both: async (docId, oldDoc, newDoc) => {
        await this.observableCollection!.change(newDoc);
      },
      leftOnly: async (docId) => {
        await this.observableCollection!.remove(docId);
      },
      rightOnly: async (docId, newDoc) => {
        await this.observableCollection!.add(newDoc);
      },
    });
  }

  processFromOplog(eventType: OplogEventType, doc: any) {
    return this.wrapWithInitialEnvironment(() => 
      this._processFromOplog(eventType, doc)
    );
  }
  _processFromOplog(eventType: OplogEventType, doc: any) {
    if (this._stopped) {
      return;
    }
    if (this.strategy === 'LIMIT_SORT') {
      return this.processLimitSort(eventType, doc);
    }
    const observableCollection = this.observableCollection!;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      if (this._onlyContainsDirectIdSelector || observableCollection.isEligible(doc)) {
        if (observableCollection.contains(doc._id)) {
          return observableCollection.change(doc);
        } else {
          return observableCollection.add(doc);
        }
      } else if (observableCollection.contains(doc._id)) {
        return observableCollection.remove(doc._id);
      }
    } else if (eventType === 'REMOVE') {
      return this.observableCollection!.remove(doc._id);
    }
  }

  processLimitSort(event: OplogEventType, doc: any) {
    const observableCollection = this.observableCollection!;
    let needToRequery = false;
    if (event === 'INSERT' && observableCollection.isEligible(doc)) {
      needToRequery = true;
    } else if (event === 'UPDATE') {
      if (
        observableCollection.isEligible(doc) ||
        observableCollection.contains(doc._id)
      ) {
        needToRequery = true;
      }
    } else if (
      event === 'REMOVE' &&
      (observableCollection.contains(doc._id) || observableCollection.options.skip)
    ) {
      needToRequery = true;
    }

    if (!needToRequery) {
      return;
    }
    this.requeryToProcess.push(doc);
    this.requeryPromise = this.requeryPromise.then(() => {
      if (this.requeryToProcess.length > 0) {
        const requeryToProcess = this.requeryToProcess;
        this.requeryToProcess = [];
        return this.requeryForLimitSort(requeryToProcess);
      }
    });
    return this.requeryPromise;
  }

  requeryPromise = Promise.resolve();
  requeryToProcess: any[] = [];
  async requeryForLimitSort(docs: any) {
    if (this._stopped) {
      return;
    }
    const observableCollection = this.observableCollection!;
    const { store, selector, options } = observableCollection;

    const newStore = new MongoIDMap();
    const collectionName = observableCollection.collectionName
    const freshIds = await observableCollection.mongoHandle
      .find(collectionName,selector, { ...options, fields: { _id: 1 } })
      .fetchAsync();

    freshIds.forEach((d: any) => newStore.set(d._id, d));
    const actionOnDocIds: string[] = [];
    const idsToAdd: any[] = [];
    await store.compareWith(newStore, {
      async leftOnly(docId) {
        if (docs.find((doc: any) => EJSON.equals(docId, doc._id))) {
          actionOnDocIds.push(docId);
        }
        await observableCollection.remove(docId);
      },
      async rightOnly(docId) {
        for (const doc of docs) {
          if (EJSON.equals(docId, doc._id)) {
            actionOnDocIds.push(docId);
            await observableCollection.add(doc);
            return;
          }
        }
        idsToAdd.push(docId);
      },
    });
    if (idsToAdd.length > 0) {
      await observableCollection.addByIds(idsToAdd);
    }

    for (const doc of docs) {
      if (!actionOnDocIds.includes(doc._id) && store.has(doc._id)) {
        await observableCollection.change(doc);
      }
    }
  }

  static cursorSupported(cursorDescription: any, matcher: any) {
    // First, check the options.
    const options = cursorDescription.options;

    // Did the user say no explicitly?
    // underscored version of the option is COMPAT with 1.2
    if (options.disableOplog || options._disableOplog) return false;

    // If a fields projection option is given check if it is supported by
    // minimongo (some operators are not supported).

    const fields = options.projection || options.fields;

    if (fields) {
      try {
        LocalCollection._checkSupportedProjection(fields);
      } catch (e: any) {
        if (e.name === 'MinimongoError') {
          return false;
        }
        throw e;
      }
    }

    // We don't allow the following selectors:
    //   - $where (not confident that we provide the same JS environment
    //             as Mongo, and can yield!)
    //   - $near (has "interesting" properties in MongoDB, like the possibility
    //            of returning an ID multiple times, though even polling maybe
    //            have a bug there)
    //           XXX: once we support it, we would need to think more on how we
    //           initialize the comparators when we create the driver.
    return !matcher.hasWhere() && !matcher.hasGeoQuery();
  }

  getFieldsOfInterest() {
    return this.observableCollection!.fieldsOfInterest;
  }
}
