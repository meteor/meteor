import { MongoID } from 'meteor/harry97:mongo-id';

export class MongoIDMap extends IdMap {
  constructor() {
    super(MongoID.idStringify, MongoID.idParse);
  }
}