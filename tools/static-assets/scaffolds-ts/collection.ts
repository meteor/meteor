import { Mongo } from 'meteor/mongo';

export type $$UpperName$$Type = {
  _id?: string;
  name: string;
  createdAt: Date;
}

export const $$UpperName$$Collection = new Mongo.Collection('$$name$$');
