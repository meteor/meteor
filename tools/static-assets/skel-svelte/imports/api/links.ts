import { Mongo } from 'meteor/mongo';

export interface Link {
  _id: string;
  url: string;
  title: string;
}

export const LinksCollection = new Mongo.Collection<Link>('links');
