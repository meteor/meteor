export const ID_GENERATORS = {
  MONGO(name) {
    return function() {
      const src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
      return new Mongo.ObjectID(src.hexString(24));
    }
  },
  STRING(name) {
    return function() {
      const src = name ? DDP.randomStream('/collection/' + name) : Random.insecure;
      return src.id();
    }
  }
};

export function setupConnection(name, options) {
  if (!name || options.connection === null) return null;
  if (options.connection) return options.connection;
  return Meteor.isClient ? Meteor.connection : Meteor.server;
}

export function setupDriver(name, connection, options) {
  if (options._driver) return options._driver;

  if (name &&
    connection === Meteor.server &&
    typeof MongoInternals !== 'undefined' &&
    MongoInternals.defaultRemoteCollectionDriver) {
    return MongoInternals.defaultRemoteCollectionDriver();
  }

  const { LocalCollectionDriver } = require('../local_collection_driver.js');
  return LocalCollectionDriver;
}

export function setupAutopublish(collection, name, options) {
  if (Package.autopublish &&
    !options._preventAutopublish &&
    collection._connection &&
    collection._connection.publish) {
    collection._connection.publish(null, () => collection.find(), {
      is_auto: true
    });
  }
}

export function setupMutationMethods(collection, name, options) {
  if (options.defineMutationMethods === false) return;

  try {
    collection._defineMutationMethods({
      useExisting: options._suppressSameNameError === true
    });
  } catch (error) {
    if (error.message === `A method named '/${name}/insertAsync' is already defined`) {
      throw new Error(`There is already a collection named "${name}"`);
    }
    throw error;
  }
}

export function validateCollectionName(name) {
  if (!name && name !== null) {
    Meteor._debug(
      'Warning: creating anonymous collection. It will not be ' +
      'saved or synchronized over the network. (Pass null for ' +
      'the collection name to turn off this warning.)'
    );
    name = null;
  }

  if (name !== null && typeof name !== 'string') {
    throw new Error(
      'First argument to new Mongo.Collection must be a string or null'
    );
  }

  return name;
}

export function normalizeOptions(options) {
  if (options && options.methods) {
    // Backwards compatibility hack with original signature
    options = { connection: options };
  }
  // Backwards compatibility: "connection" used to be called "manager".
  if (options && options.manager && !options.connection) {
    options.connection = options.manager;
  }

  const cleanedOptions = Object.fromEntries(
    Object.entries(options || {}).filter(([_, v]) => v !== undefined),
  );

  // 2) Spread defaults first, then only the defined overrides
  return {
    connection: undefined,
    idGeneration: 'STRING',
    transform: null,
    _driver: undefined,
    _preventAutopublish: false,
    ...cleanedOptions,
  };
}
