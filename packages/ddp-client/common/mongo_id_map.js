import { MongoID } from 'meteor/mongo-id';

export class MongoIDMap extends IdMap {
  constructor() {
    super(MongoID.idStringify, MongoID.idParse);
  }
}