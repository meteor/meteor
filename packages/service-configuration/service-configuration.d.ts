import { Mongo } from 'meteor/mongo';

export interface Configuration {
  _id?: string;
  /** The login service this configuration is for (e.g. "google", "facebook"). */
  service?: string;
  appId: string;
  secret: string;
  clientId?: string;
  loginStyle?: string;
  /** Service-specific configuration keys. */
  [key: string]: any;
}

declare class ConfigError extends Error {
  constructor(serviceName?: string);
  message: string;
}

export var ServiceConfiguration: {
  configurations: Mongo.Collection<Configuration>;
  ConfigError: typeof ConfigError
};
