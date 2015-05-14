
Accounts_connection = Meteor.connection;

if (typeof __meteor_runtime_config__ !== "undefined" &&
    __meteor_runtime_config__.ACCOUNTS_CONNECTION_URL) {
  // Temporary, internal hook to allow the server to point the client
  // to a different authentication server. This is for a very
  // particular use case that comes up when implementing a oauth
  // server. Unsupported and may go away at any point in time.
  //
  // We will eventually provide a general way to use account-base
  // against any DDP connection, not just one special one.
  Accounts_connection = DDP.connect(
    __meteor_runtime_config__.ACCOUNTS_CONNECTION_URL)
}
