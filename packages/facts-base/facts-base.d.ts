/** Name of the collection facts are published through. */
export const FACTS_COLLECTION: string;
/** Name of the publication that streams server facts to clients. */
export const FACTS_PUBLICATION: string;

export namespace Facts {
  /**
   * (Server) Restrict which users receive facts. The filter is called with the
   * subscribing user's id (or `null`) and returns whether to send facts.
   */
  function setUserIdFilter(filter: (userId: string | null) => boolean): void;

  /**
   * (Server) Increment a named fact for a package and notify subscribers.
   */
  function incrementServerFact(pkg: string, fact: string, increment: number): void;

  /** (Server) Reset all recorded server facts to zero. */
  function resetServerFacts(): void;
}
