import isEmpty from 'lodash.isempty';
import { Meteor } from 'meteor/meteor';
import { CursorDescription } from './cursor_description';
import { MongoConnection } from './mongo_connection';

import { NpmModuleMongodb } from "meteor/npm-mongo";
const { Long } = NpmModuleMongodb;

export const OPLOG_COLLECTION = 'oplog.rs';

let TOO_FAR_BEHIND = +(process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000);
const TAIL_TIMEOUT = +(process.env.METEOR_OPLOG_TAIL_TIMEOUT || 30000);

export interface OplogEntry {
  op: string;
  o: any;
  o2?: any;
  ts: any;
  ns: string;
}

export interface CatchingUpResolver {
  ts: any;
  resolver: () => void;
}

export interface OplogTrigger {
  dropCollection: boolean;
  dropDatabase: boolean;
  op: OplogEntry;
  collection?: string;
  id?: string | null;
}

export class OplogHandle {
  private _oplogUrl: string;
  public _dbName: string;
  private _oplogLastEntryConnection: MongoConnection | null;
  private _oplogTailConnection: MongoConnection | null;
  private _oplogOptions: {
    excludeCollections?: string[];
    includeCollections?: string[];
  };
  private _stopped: boolean;
  private _tailHandle: any;
  private _readyPromiseResolver: (() => void) | null;
  private _readyPromise: Promise<void>;
  public _crossbar: any;
  private _catchingUpResolvers: CatchingUpResolver[];
  private _lastProcessedTS: any;
  private _onSkippedEntriesHook: any;
  private _startTrailingPromise: Promise<void>;
  private _resolveTimeout: any;

  private _entryQueue = new Meteor._DoubleEndedQueue();
  private _workerActive = false;
  private _workerPromise: Promise<void> | null = null;

  constructor(oplogUrl: string, dbName: string) {
    this._oplogUrl = oplogUrl;
    this._dbName = dbName;

    this._resolveTimeout = null;
    this._oplogLastEntryConnection = null;
    this._oplogTailConnection = null;
    this._stopped = false;
    this._tailHandle = null;
    this._readyPromiseResolver = null;
    this._readyPromise = new Promise(r => this._readyPromiseResolver = r); 
    this._crossbar = new DDPServer._Crossbar({
      factPackage: "mongo-livedata", factName: "oplog-watchers"
    });

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

    this._catchingUpResolvers = [];
    this._lastProcessedTS = null;

    this._onSkippedEntriesHook = new Hook({
      debugPrintExceptions: "onSkippedEntries callback"
    });

    this._startTrailingPromise = this._startTailing();
  }

  private _getOplogSelector(lastProcessedTS?: any): any {
    const oplogCriteria: any = [
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
    if(lastProcessedTS) {
      oplogCriteria.push({
        ts: { $gt: lastProcessedTS },
      });
    }

    return {
      $and: oplogCriteria,
    };
  }

  async stop(): Promise<void> {
    if (this._stopped) return;
    this._stopped = true;
    if (this._tailHandle) {
      await this._tailHandle.stop();
    }
  }

  async _onOplogEntry(trigger: OplogTrigger, callback: Function): Promise<{ stop: () => Promise<void> }> {
    if (this._stopped) {
      throw new Error("Called onOplogEntry on stopped handle!");
    }

    await this._readyPromise;

    const originalCallback = callback;

    /**
     * This depends on AsynchronousQueue tasks being wrapped in `bindEnvironment` too.
     *
     * @todo Check after we simplify the `bindEnvironment` implementation if we can remove the second wrap.
     */
    callback = Meteor.bindEnvironment(
      function (notification: any) {
        originalCallback(notification);
      },
      // @ts-ignore
      function (err) {
        Meteor._debug("Error in oplog callback", err);
      }
    );

    const listenHandle = this._crossbar.listen(trigger, callback);
    return {
      stop: async function () {
        await listenHandle.stop();
      }
    };
  }

  onOplogEntry(trigger: OplogTrigger, callback: Function): Promise<{ stop: () => Promise<void> }> {
    return this._onOplogEntry(trigger, callback);
  }

  onSkippedEntries(callback: Function): { stop: () => void } {
    if (this._stopped) {
      throw new Error("Called onSkippedEntries on stopped handle!");
    }
    return this._onSkippedEntriesHook.register(callback);
  }

  async _waitUntilCaughtUp(): Promise<void> {
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

    while (insertAfter - 1 > 0 && this._catchingUpResolvers[insertAfter - 1].ts.greaterThan(ts)) {
      insertAfter--;
    }

    let promiseResolver = null;

    const promiseToAwait = new Promise(r => promiseResolver = r);

    clearTimeout(this._resolveTimeout);

    this._resolveTimeout = setTimeout(() => {
      console.error("Meteor: oplog catching up took too long", { ts });
    }, 10000);

    this._catchingUpResolvers.splice(insertAfter, 0, { ts, resolver: promiseResolver! });

    await promiseToAwait;

    clearTimeout(this._resolveTimeout);
  }

  async waitUntilCaughtUp(): Promise<void> {
    return this._waitUntilCaughtUp();
  }

  async _startTailing(): Promise<void> {
    const mongodbUri = require('mongodb-uri');
    if (mongodbUri.parse(this._oplogUrl).database !== 'local') {
      throw new Error("$MONGO_OPLOG_URL must be set to the 'local' database of a Mongo replica set");
    }

    this._oplogTailConnection = new MongoConnection(
      this._oplogUrl, { maxPoolSize: 1, minPoolSize: 1 }
    );
    this._oplogLastEntryConnection = new MongoConnection(
      this._oplogUrl, { maxPoolSize: 1, minPoolSize: 1 }
    );

    try {
      const isMasterDoc = await this._oplogLastEntryConnection!.db
        .admin()
        .command({ ismaster: 1 });

      if (!(isMasterDoc && isMasterDoc.setName)) {
        throw new Error("$MONGO_OPLOG_URL must be set to the 'local' database of a Mongo replica set");
      }

      const lastOplogEntry = await this._oplogLastEntryConnection.findOneAsync(
        OPLOG_COLLECTION,
        {},
        { sort: { $natural: -1 }, projection: { ts: 1 } }
      );

      const oplogSelector = this._getOplogSelector(lastOplogEntry?.ts);
      if (lastOplogEntry) {
        this._lastProcessedTS = lastOplogEntry.ts;
      }

      const cursorDescription = new CursorDescription(
        OPLOG_COLLECTION,
        oplogSelector,
        { tailable: true }
      );

      this._tailHandle = this._oplogTailConnection.tail(
        cursorDescription,
        (doc: any) => {
          this._entryQueue.push(doc);
          this._maybeStartWorker();
        },
        TAIL_TIMEOUT
      );

      this._readyPromiseResolver!();
    } catch (error) {
      console.error('Error in _startTailing:', error);
      throw error;
    }
  }

  private _maybeStartWorker(): void {
    if (this._workerPromise) return;
    this._workerActive = true;

    // Convert to a proper promise-based queue processor
    this._workerPromise = (async () => {
      try {
        while (!this._stopped && !this._entryQueue.isEmpty()) {
          // Are we too far behind? Just tell our observers that they need to
          // repoll, and drop our queue.
          if (this._entryQueue.length > TOO_FAR_BEHIND) {
            const lastEntry = this._entryQueue.pop();
            this._entryQueue.clear();

            this._onSkippedEntriesHook.each((callback: Function) => {
              callback();
              return true;
            });

            // Free any waitUntilCaughtUp() calls that were waiting for us to
            // pass something that we just skipped.
            this._setLastProcessedTS(lastEntry.ts);
            continue;
          }

          // Process next batch from the queue
          const doc = this._entryQueue.shift();

          try {
            await handleDoc(this, doc);
            // Process any waiting fence callbacks
            if (doc.ts) {
              this._setLastProcessedTS(doc.ts);
            }
          } catch (e) {
            // Keep processing queue even if one entry fails
            console.error('Error processing oplog entry:', e);
          }
        }
      } finally {
        this._workerPromise = null;
        this._workerActive = false;
      }
    })();
  }

  _setLastProcessedTS(ts: any): void {
    this._lastProcessedTS = ts;
    while (!isEmpty(this._catchingUpResolvers) && this._catchingUpResolvers[0].ts.lessThanOrEqual(this._lastProcessedTS)) {
      const sequencer = this._catchingUpResolvers.shift()!;
      sequencer.resolver();
    }
  }

  _defineTooFarBehind(value: number): void {
    TOO_FAR_BEHIND = value;
  }

  _resetTooFarBehind(): void {
    TOO_FAR_BEHIND = +(process.env.METEOR_OPLOG_TOO_FAR_BEHIND || 2000);
  }
}

export function idForOp(op: OplogEntry): string {
  if (op.op === 'd' || op.op === 'i') {
    return op.o._id;
  } else if (op.op === 'u') {
    return op.o2._id;
  } else if (op.op === 'c') {
    throw Error("Operator 'c' doesn't supply an object with id: " + JSON.stringify(op));
  } else {
    throw Error("Unknown op: " + JSON.stringify(op));
  }
}

async function handleDoc(handle: OplogHandle, doc: OplogEntry): Promise<void> {
  if (doc.ns === "admin.$cmd") {
    if (doc.o.applyOps) {
      // This was a successful transaction, so we need to apply the
      // operations that were involved.
      let nextTimestamp = doc.ts;
      for (const op of doc.o.applyOps) {
        // See https://github.com/meteor/meteor/issues/10420.
        if (!op.ts) {
          op.ts = nextTimestamp;
          nextTimestamp = nextTimestamp.add(Long.ONE);
        }
        await handleDoc(handle, op);
      }
      return;
    }
    throw new Error("Unknown command " + JSON.stringify(doc));
  }

  const trigger: OplogTrigger = {
    dropCollection: false,
    dropDatabase: false,
    op: doc,
  };

  if (typeof doc.ns === "string" && doc.ns.startsWith(handle._dbName + ".")) {
    trigger.collection = doc.ns.slice(handle._dbName.length + 1);
  }

  // Is it a special command and the collection name is hidden
  // somewhere in operator?
  if (trigger.collection === "$cmd") {
    if (doc.o.dropDatabase) {
      delete trigger.collection;
      trigger.dropDatabase = true;
    } else if ("drop" in doc.o) {
      trigger.collection = doc.o.drop;
      trigger.dropCollection = true;
      trigger.id = null;
    } else if ("create" in doc.o && "idIndex" in doc.o) {
      // A collection got implicitly created within a transaction. There's
      // no need to do anything about it.
    } else {
      throw Error("Unknown command " + JSON.stringify(doc));
    }
  } else {
    // All other ops have an id.
    trigger.id = idForOp(doc);
  }

  await handle._crossbar.fire(trigger);

  await new Promise(resolve => setImmediate(resolve));
}