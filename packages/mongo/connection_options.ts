declare const Mongo: {
  setConnectionOptions: (options: Record<string, unknown>) => void;
  _connectionOptions: Record<string, unknown>;
};
declare function check(value: unknown, pattern: unknown): void;

/**
 * @summary Allows for user specified connection options
 * @example http://mongodb.github.io/node-mongodb-native/3.0/reference/connecting/connection-settings/
 * @locus Server
 * @param {Object} options User specified Mongo connection options
 */
Mongo.setConnectionOptions = function setConnectionOptions (options: Record<string, unknown>) {
  check(options, Object);
  Mongo._connectionOptions = options;
};