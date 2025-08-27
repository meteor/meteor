import isEmpty from "lodash.isempty";
import { Meteor } from "meteor/meteor";
import { NpmModuleMongodb } from "meteor/npm-mongo";
import { isDeepStrictEqual } from "node:util";
import { MongoID } from 'meteor/mongo-id';

import type {
  NewOplogObserveDriver,
  OplogEventType,
} from "./new_oplog_observe_driver";
import { getDedicatedChannel, getFieldsOfInterestFromAll } from "./utils";
import { MongoConnection } from "../mongo_connection";
import type { CatchingUpResolver, OplogEntry } from "../oplog_tailing";

const { Long } = NpmModuleMongodb;

const OPLOG_COLLECTION = "oplog.rs";

const TAIL_TIMEOUT = +(process.env.METEOR_OPLOG_TAIL_TIMEOUT || 30000);

export class NewOplogTailing {
  queue: any;
  store: { [key: string]: NewOplogObserveDriver[] };
  private _oplogLastEntryConnection: MongoConnection | null;
  private _oplogUrl: string;
  private _dbName: string;
  private _oplogOptions: {
    excludeCollections?: string[];
    includeCollections?: string[];
  };
  private _lastProcessedTS: any;
  private _tailHandle: any;
  private _readyPromiseResolver!: () => void;
  private _readyPromise = new Promise<void>(
    (r) => (this._readyPromiseResolver = r)
  );
  private _catchingUpResolvers: CatchingUpResolver[] = [];
  private _stopped = false;
  _startTrailingPromise: Promise<void> | null = null;

  constructor(oplogUrl: string, dbName: string) {
    this._oplogUrl = oplogUrl;
    this._dbName = dbName;
    this.queue = new Meteor._AsynchronousQueue();
    this.store = {};
    const includeCollections =
      Meteor.settings?.packages?.mongo?.oplogIncludeCollections;
    const excludeCollections =
      Meteor.settings?.packages?.mongo?.oplogExcludeCollections;
    if (includeCollections?.length && excludeCollections?.length) {
      throw new Error(
        "Can't use both mongo oplog settings oplogIncludeCollections and oplogExcludeCollections at the same time."
      );
    }
    this._oplogOptions = { includeCollections, excludeCollections };
    this._startTrailingPromise = this._startTailing();
  }

  async stop(): Promise<void> {
    if (this._stopped) return;
    this._stopped = true;
    if (this._tailHandle) {
      await this._tailHandle.stop();
    }
  }

  getAllSubscribers() {
    const subscribers: NewOplogObserveDriver[] = [];
    for (const observers of Object.values(this.store)) {
      subscribers.push(...observers);
    }
    return subscribers;
  }

  attach(subscriber: NewOplogObserveDriver) {
    for (const channel of subscriber.channels) {
      if (!this.store[channel]) {
        this.store[channel] = [];
      }
      this.store[channel].push(subscriber);
    }
  }

  detach(subscriber: NewOplogObserveDriver) {
    for (const channel of subscriber.channels) {
      this.store[channel] = this.store[channel]?.filter((s) => s !== subscriber);
      if (this.store[channel] && this.store[channel].length === 0) {
        delete this.store[channel];
      }
    }
  }

  async _startTailing() {
    const oplogTailConnection = new MongoConnection(this._oplogUrl, {
      maxPoolSize: 1,
      minPoolSize: 1,
    });
    this._oplogLastEntryConnection = new MongoConnection(this._oplogUrl, {
      maxPoolSize: 1,
      minPoolSize: 1,
    });

    const lastOplogEntry = await this._oplogLastEntryConnection.findOneAsync(
      OPLOG_COLLECTION,
      {},
      { sort: { $natural: -1 }, projection: { ts: 1 } }
    );
    const oplogSelector = this._getOplogSelector(lastOplogEntry?.ts);

    if (lastOplogEntry) {
      this._lastProcessedTS = lastOplogEntry.ts;
    }

    const cursorDescription = {
      collectionName: OPLOG_COLLECTION,
      selector: oplogSelector,
      options: {
        tailable: true,
        projection: {
          op: 1,
          ts: 1,
          ns: 1,
          "o._id": 1,
          "o2._id": 1,
          "o.drop": 1,
          "o.applyOps": 1,
        },
      },
    };

    this._tailHandle = oplogTailConnection.tail(
      cursorDescription,
      async (doc: any) => {
        const promise = this.processOplogDocument(doc);
        //When there is a lot of oplog entries, some processing is done in parallel.
        //This queue ensure that the timestamp is set only after all preceding entries are processed.
        //This guarantees that after an await myCollection.updateAsync(docId, ...), all prior oplog entries have been processed.
        this.tailingQueue = this.tailingQueue.then(() => promise);
        await this.tailingQueue;
        this._setLastProcessedTS(doc.ts);
      },
      TAIL_TIMEOUT
    );
    this._readyPromiseResolver!();
  }

  private async processOplogDocument(oplogDocument: any) {
    if (oplogDocument.ns === "admin.$cmd") {
      if (oplogDocument.o.applyOps) {
        // This was a successful transaction, so we need to apply the
        // operations that were involved.
        let nextTimestamp = oplogDocument.ts;
        return Promise.all(
          oplogDocument.o.applyOps.map((op) => {
            // See https://github.com/meteor/meteor/issues/10420.
            if (!op.ts) {
              op.ts = nextTimestamp;
              nextTimestamp = nextTimestamp.add(Long.ONE);
            }
            return this.processOplogDocument(op);
          })
        );
      }
      throw new Error("Unknown command " + JSON.stringify(oplogDocument));
    }

    if (
      typeof oplogDocument.ns !== "string" ||
      !oplogDocument.ns.startsWith(this._dbName + ".")
    ) {
      return;
    }
    const collectionName = oplogDocument.ns.slice(this._dbName.length + 1);
    if (oplogDocument.o.drop) {
      for (const subscribers of Object.values(this.store)) {
        for (const subscriber of subscribers) {
          if (
            !subscriber._stopped &&
            subscriber.observableCollection?.collectionName ===
              oplogDocument.o.drop
          ) {
            await subscriber.reload();
          }
        }
      }
      return;
    }

    const id = oplogDocument.o?._id ?? oplogDocument.o2?._id;
    if (!collectionName || !id) {
      return;
    }

    let eventType: OplogEventType;
    if (oplogDocument.op === "i") {
      eventType = "INSERT";
    } else if (oplogDocument.op === "u") {
      eventType = "UPDATE";
    } else if (oplogDocument.op === "d") {
      eventType = "REMOVE";
    } else {
      throw new Meteor.Error(
        `Unknown oplog event type "${
          oplogDocument.op
        }" for document ${JSON.stringify(oplogDocument)}`
      );
    }

    const subscribers = [
      ...(this.store[collectionName] ?? []),
      ...(this.store[getDedicatedChannel(collectionName, id)] ?? []),
    ].filter((s) => !s._stopped);
    if (subscribers.length === 0) {
      return;
    }


    const doc = await this.getDoc( subscribers, id, eventType);
    if (!doc) {
      return;
    }
    for (const subscriber of subscribers) {
      try {
        await subscriber.processFromOplog(eventType, doc);
      } catch (e) {
        Meteor._debug(`Exception while processing event`, e);
      }
    }
  }

  documentsToFetch = new Map<
    string,
    {
      doc: any;
      collectionName: string;
      fieldsOfInterest:
        | true
        | {
            [key: string]: 1;
          };
    }
  >();

  queueGetDoc: Promise<any> = Promise.resolve();
  async getDoc(
    subscribers: NewOplogObserveDriver[],
    id: any,
    eventType: OplogEventType
  ) {
    const stringifiedId = MongoID.idStringify(id);
    if (eventType === "REMOVE") {
      this.queueGetDoc = this.queueGetDoc.then(() => {
        return { _id: id };
      });
      return this.queueGetDoc;
    }
    const observableCollection = subscribers[0].observableCollection!;
    const mongoHandle = observableCollection.mongoHandle

    const collectionName = observableCollection.collectionName;

    const fieldsOfInterest = getFieldsOfInterestFromAll(subscribers);
    this.documentsToFetch.set(stringifiedId, {
      fieldsOfInterest,
      doc: null,
      collectionName,
    });
    this.queueGetDoc = this.queueGetDoc.then(async () => {
      const documentsToFetch = this.documentsToFetch.get(stringifiedId);
      if (!documentsToFetch) {
        return;
      }
      this.documentsToFetch.delete(stringifiedId);
      if (documentsToFetch.doc) {
        return documentsToFetch.doc;
      }

      const documentIds = [MongoID.idParse(stringifiedId)];
      let count = 0;
      const limit = 1000;
      for (const [key, value] of this.documentsToFetch) {
        if (count >= limit) {
          break;
        }
        if (
          value.collectionName === collectionName &&
          isDeepStrictEqual(value.fieldsOfInterest, fieldsOfInterest)
        ) {
          documentIds.push(MongoID.idParse(key));
          count++;
        }
      }
      const items = await mongoHandle.
        find(collectionName,
          { _id: { $in: documentIds } },
          {
            projection:
              fieldsOfInterest === true ? undefined : fieldsOfInterest,
          }
        )
        .fetchAsync();

      let result: any;
      for (const item of items) {
        const itemId = MongoID.idStringify(item._id);
        if (itemId === stringifiedId) {
          result = item;
        } else {
          const docToFetch = this.documentsToFetch.get(itemId);
          if (docToFetch) {
            docToFetch.doc = item;
          }
        }
      }
      return result;
    });
    return this.queueGetDoc;
  }
  tailingQueue: Promise<any> = Promise.resolve();

  _getOplogSelector(lastProcessedTS?: Date) {
    const oplogCriteria: any[] = [
      {
        $or: [
          { op: { $in: ["i", "u", "d"] } },
          { op: "c", "o.drop": { $exists: true } },
          { op: "c", "o.dropDatabase": 1 },
          { op: "c", "o.applyOps": { $exists: true } },
        ],
      },
    ];

    const nsRegex = new RegExp(
      "^(?:" +
        [
          // @ts-ignore
          Meteor._escapeRegExp(this._dbName + "."),
          // @ts-ignore
          Meteor._escapeRegExp("admin.$cmd"),
        ].join("|") +
        ")"
    );

    if (this._oplogOptions.excludeCollections?.length) {
      oplogCriteria.push({
        ns: {
          $regex: nsRegex,
          $nin: this._oplogOptions.excludeCollections.map(
            (collName: string) => `${this._dbName}.${collName}`
          ),
        },
      });
    } else if (this._oplogOptions.includeCollections?.length) {
      oplogCriteria.push({
        $or: [
          { ns: /^admin\.\$cmd/ },
          {
            ns: {
              $in: this._oplogOptions.includeCollections.map(
                (collName: string) => `${this._dbName}.${collName}`
              ),
            },
          },
        ],
      });
    } else {
      oplogCriteria.push({
        ns: nsRegex,
      });
    }

    if (lastProcessedTS) {
      oplogCriteria.push({
        ts: { $gt: lastProcessedTS },
      });
    }

    return {
      $and: oplogCriteria,
    };
  }

  async waitUntilCaughtUp(): Promise<void> {
    if (this._stopped) {
      throw new Error("Called waitUntilCaughtUp on stopped handle!");
    }

    await this._readyPromise;

    let lastEntry: OplogEntry | null = null;

    while (!this._stopped) {
      const oplogSelector = this._getOplogSelector();
      try {
        lastEntry = await this._oplogLastEntryConnection.findOneAsync(
          OPLOG_COLLECTION,
          oplogSelector,
          { projection: { ts: 1 }, sort: { $natural: -1 } }
        );
        break;
      } catch (e) {
        Meteor._debug("Got exception while reading last entry", e);
        // @ts-ignore
        await Meteor.sleep(100);
      }
    }

    if (this._stopped) return;

    if (!lastEntry) return;

    const ts = lastEntry.ts;
    if (!ts) {
      throw Error("oplog entry without ts: " + JSON.stringify(lastEntry));
    }

    if (this._lastProcessedTS && ts.lessThanOrEqual(this._lastProcessedTS)) {
      return;
    }

    let insertAfter = this._catchingUpResolvers.length;

    while (
      insertAfter - 1 > 0 &&
      this._catchingUpResolvers[insertAfter - 1].ts.greaterThan(ts)
    ) {
      insertAfter--;
    }

    let promiseResolver = null;

    const promiseToAwait = new Promise((r) => (promiseResolver = r));

    this._catchingUpResolvers.splice(insertAfter, 0, {
      ts,
      resolver: promiseResolver!,
    });

    await promiseToAwait;
  }

  _setLastProcessedTS(ts: any): void {
    this._lastProcessedTS = ts;
    while (
      !isEmpty(this._catchingUpResolvers) &&
      this._catchingUpResolvers[0].ts.lessThanOrEqual(this._lastProcessedTS)
    ) {
      const sequencer = this._catchingUpResolvers.shift()!;
      sequencer.resolver();
    }
  }
}
