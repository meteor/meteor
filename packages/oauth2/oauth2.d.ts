import type { ParsedQs } from "qs";

// The oauth2 package does not export any new symbols; it only
// augments the main oauth module.
declare module "meteor/oauth" {
  namespace OAuth {
    interface OAuthVersions {
      [2]: {
        urls: null;
        query: ParsedQs;
      };
    }
  }
}
