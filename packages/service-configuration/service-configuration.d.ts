import { Mongo } from "meteor/mongo";

export interface Configuration {
  _id?: string;
  /** The login service this configuration is for (e.g. "google", "facebook"). Optional for compatibility with legacy provider-specific shapes. */
  service?: string;
  /** Provider-specific application identifier. */
  appId?: string;
  /** Provider-specific secret. */
  secret?: string;
  clientId?: string;
  loginStyle?: string;
  /** Service-specific configuration keys. */
  [key: string]: unknown;
}

declare class ConfigError extends Error {
  constructor(serviceName?: string);
  message: string;
}

export var ServiceConfiguration: {
  configurations: Mongo.Collection<Configuration>;
  ConfigError: typeof ConfigError;
};
