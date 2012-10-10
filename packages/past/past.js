// Old under_score version of camelCase public API names.
Meteor.is_client = Meteor.isClient;
Meteor.is_server = Meteor.isServer;
Meteor.deps.Context.prototype.on_invalidate =
  Meteor.deps.Context.prototype.onInvalidate;
// See also the "this.is_simulation" assignment in livedata/livedata_common.js
// and the retry_count and retry_time fields of self.current_status in
// stream/stream_client.js.
