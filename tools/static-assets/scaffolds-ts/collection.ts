import { Mongo } from 'meteor/mongo';

export type $$UpperName$$ = {
  _id?: string;
  name: string;
  createdAt: Date;
}

export const $$UpperName$$Collection = new Mongo.Collection<$$UpperName$$, $$UpperName$$>('$$name$$');
