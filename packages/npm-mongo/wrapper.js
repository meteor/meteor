const { MongoClient, MongoCompatibilityError } = Npm.require('mongodb');

function connect(client) {
  return client.connect()
    .catch(error => {
      if (error.cause instanceof MongoCompatibilityError && error.message.includes('maximum wire version')) {
      console.warn(`[DEPRECATION] Legacy MongoDB version detected, using mongo-legacy package: ${error.message}
        Warning: MongoDB versions <= 3.6 are deprecated. Some Meteor features may not work properly with this version.
        It is recommended to use MongoDB >= 4.`);
      if (!Package['npm-mongo-legacy']) {
        throw new Error('Please, install npm-mongo-legacy package to use this version of MongoDB running "meteor add npm-mongo-legacy", then move the listed package inside .meteor/packages to the top.');
      }
      return false
    }
  })
}

if (process.env.MONGO_URL && (/^mongodb(\+srv)?:\/\//.test(process.env.MONGO_URL))) {
  try {
    connect(new MongoClient(process.env.MONGO_URL, {
      tls: true,
      tlsAllowInvalidCertificates: true,
    })).then(client => {
      if (client) client.close();
    });
  } catch (e) {
    console.warn('Invalid MongoDB connection string in MONGO_URL:', process.env.MONGO_URL);
  }
}

const useLegacyMongo = !!Package['npm-mongo-legacy']
const oldNoDeprecationValue = process.noDeprecation;

useLegacyMongo && console.log('WARN: npm-mongo-legacy package detected, using package for mongo <= 3.6');

try {
  // Silence deprecation warnings introduced in a patch update to mongodb:
  // https://github.com/meteor/meteor/pull/9942#discussion_r218564879
  process.noDeprecation = true;
  NpmModuleMongodb = useLegacyMongo
    ? Package['npm-mongo-legacy'].NpmModuleMongodb
    : Npm.require('mongodb');
} finally {
  process.noDeprecation = oldNoDeprecationValue;
}

NpmModuleMongodbVersion = useLegacyMongo
  ? Package['npm-mongo-legacy'].NpmModuleMongodbVersion
  : Npm.require('mongodb/package.json').version;
