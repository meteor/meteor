import { Mongo } from 'meteor/mongo';

export type $$PascalName$$ = {
  _id?: string;
  name: string;
  createdAt: Date;
}

export const $$PascalName$$Collection = new Mongo.Collection<$$PascalName$$, $$PascalName$$>('$$name$$');
