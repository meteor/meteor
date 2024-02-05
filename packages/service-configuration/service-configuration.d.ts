import { Mongo } from 'meteor/mongo';

export interface Configuration {
  appId: string;
  secret: string;
}

declare class ConfigError extends Error {
  constructor(serviceName?: string);
  message: string;
}

export declare var ServiceConfiguration: {
  configurations: Mongo.Collection<Configuration>;
  ConfigError: typeof ConfigError
};
