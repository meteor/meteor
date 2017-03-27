export class MongoIDMap extends IdMap {
  constructor() {
    super(
      MongoID.idStringify,
      MongoID.idParse,
    );
  }
}
