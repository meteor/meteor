import Crossbar from "./crossbar.js";
import WriteFence from "./writefence.js";
import { calculateVersion } from "./server.js";

export const DDPServer = {};

// Compatibility for `mongo` package which relies on this.
DDPServer._Crossbar = Crossbar;

DDPServer._WriteFence = WriteFence;

// The current write fence. When there is a current write fence, code
// that writes to databases should register their writes with it using
// beginWrite().
//
DDPServer._CurrentWriteFence = new Meteor.EnvironmentVariable;

// The "invalidation crossbar" is a specific instance used by the DDP server to
// implement write fence notifications. Listener callbacks on this crossbar
// should call beginWrite on the current write fence before they return, if they
// want to delay the write fence from firing (ie, the DDP method-data-updated
// message from being sent).
DDPServer._InvalidationCrossbar = new Crossbar({
  factName: "invalidation-crossbar-listeners"
});

DDPServer._calculateVersion = calculateVersion;
