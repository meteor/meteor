const { MongoClient } = Npm.require('mongodb');

if (
  process.env.MONGO_URL &&
  /^mongodb(\+srv)?:\/\//.test(process.env.MONGO_URL)
) {
  try {
    // Validate the URL without opening a second credential-bearing connection.
    new MongoClient(process.env.MONGO_URL);
  } catch (e) {
    console.warn('Invalid MongoDB connection string in MONGO_URL');
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
