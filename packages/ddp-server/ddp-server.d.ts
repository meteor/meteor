export namespace DDPServer {
  /** How a publication reconciles documents across overlapping subscriptions. */
  interface PublicationStrategy {
    useDummyDocumentView: boolean;
    useCollectionView: boolean;
    doAccountingForCollection: boolean;
  }

  /** The built-in publication strategies, passed to `setPublicationStrategy`. */
  var publicationStrategies: {
    SERVER_MERGE: PublicationStrategy;
    NO_MERGE_NO_HISTORY: PublicationStrategy;
    NO_MERGE: PublicationStrategy;
    NO_MERGE_MULTI: PublicationStrategy;
  };
}
