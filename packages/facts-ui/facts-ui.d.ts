import { Mongo } from "meteor/mongo";

// facts-ui runs on the client and adds `Facts.server`, a live collection of the
// facts published by facts-base, keyed by package name.
declare module "meteor/facts-base" {
  namespace Facts {
    /** (Client) Reactive collection of server facts, indexed by package. */
    const server: Mongo.Collection<Record<string, number>>;
  }
}

export {};
