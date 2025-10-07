import once from 'lodash.once';
import {
  ASYNC_COLLECTION_METHODS,
  getAsyncMethodName,
  CLIENT_ONLY_METHODS
} from "meteor/minimongo/constants";
import { MongoConnection } from './mongo_connection';

// Define interfaces and types
interface IConnectionOptions {
  oplogUrl?: string;
  [key: string]: unknown;  // Changed from 'any' to 'unknown' for better type safety
}

interface IMongoInternals {
  RemoteCollectionDriver: typeof RemoteCollectionDriver;
  defaultRemoteCollectionDriver: () => RemoteCollectionDriver;
}

// More specific typing for collection methods
type MongoMethodFunction = (...args: unknown[]) => unknown;
interface ICollectionMethods {
  [key: string]: MongoMethodFunction;
}

// Type for MongoConnection
interface IMongoClient {
  connect: () => Promise<void>;
}

interface IMongoConnection {
  client: IMongoClient;
  [key: string]: MongoMethodFunction | IMongoClient;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MONGO_URL: string;
      MONGO_OPLOG_URL?: string;
    }
  }

  const MongoInternals: IMongoInternals;
  const Meteor: {
    startup: (callback: () => Promise<void>) => void;
  };
}

class RemoteCollectionDriver {
  private readonly mongo: MongoConnection;

  private static readonly REMOTE_COLLECTION_METHODS = [
    'createCappedCollectionAsync',
    'dropIndexAsync',
    'ensureIndexAsync',
    'createIndexAsync',
    'countDocuments',
    'dropCollectionAsync',
    'estimatedDocumentCount',
    'find',
    'findOneAsync',
    'insertAsync',
    'rawCollection',
    'removeAsync',
    'updateAsync',
    'upsertAsync',
  ] as const;

  constructor(mongoUrl: string, options: IConnectionOptions) {
    this.mongo = new MongoConnection(mongoUrl, options);
  }

  public open(name: string): ICollectionMethods {
    const ret: ICollectionMethods = {};

    // Handle remote collection methods
    RemoteCollectionDriver.REMOTE_COLLECTION_METHODS.forEach((method) => {
      // Type assertion needed because we know these methods exist on MongoConnection
      const mongoMethod = this.mongo[method] as MongoMethodFunction;
      ret[method] = mongoMethod.bind(this.mongo, name);

      if (!ASYNC_COLLECTION_METHODS.includes(method)) return;

      const asyncMethodName = getAsyncMethodName(method);
      ret[asyncMethodName] = (...args: unknown[]) => ret[method](...args);
    });

    // Handle client-only methods
    CLIENT_ONLY_METHODS.forEach((method) => {
      ret[method] = (...args: unknown[]): never => {
        throw new Error(
          `${method} is not available on the server. Please use ${getAsyncMethodName(
            method
          )}() instead.`
        );
      };
    });

    return ret;
  }
}

// Assign the class to MongoInternals
MongoInternals.RemoteCollectionDriver = RemoteCollectionDriver;

// Create the singleton RemoteCollectionDriver only on demand
MongoInternals.defaultRemoteCollectionDriver = once((): RemoteCollectionDriver => {
  const connectionOptions: IConnectionOptions = {};
  const mongoUrl = process.env.MONGO_URL;

  if (!mongoUrl) {
    throw new Error("MONGO_URL must be set in environment");
  }

  if (process.env.MONGO_OPLOG_URL) {
    connectionOptions.oplogUrl = process.env.MONGO_OPLOG_URL;
  }

  const driver = new RemoteCollectionDriver(mongoUrl, connectionOptions);

  // Initialize database connection on startup
  Meteor.startup(async (): Promise<void> => {
    await driver.mongo.client.connect();
  });

  return driver;
});

export { RemoteCollectionDriver, IConnectionOptions, ICollectionMethods };