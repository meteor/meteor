import { Mongo } from 'meteor/mongo';

export const LinksCollection: Mongo.Collection<any> = new Mongo.Collection('links');
