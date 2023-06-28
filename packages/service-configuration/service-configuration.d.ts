import { Mongo } from 'meteor/mongo';

export interface Configuration {
  appId: string;
  secret: string;
}

export declare var ServiceConfiguration: {
  configurations: Mongo.Collection<Configuration>;
};
