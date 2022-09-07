import { Mongo } from 'meteor/mongo';

interface Configuration {
  appId: string;
  secret: string;
}

declare var ServiceConfiguration: {
  configurations: Mongo.Collection<Configuration>;
};
