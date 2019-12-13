import { Mongo } from 'meteor/mongo';

export interface Link {
  _id?: string;
  title: string;
  url: string;
  createdAt: Date;
}

export const Links = new Mongo.Collection<Link>('links');
