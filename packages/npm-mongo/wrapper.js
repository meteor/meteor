const { MongoClient } = Npm.require('mongodb');

function redactMongoUrl(mongoUrl) {
  return mongoUrl.replace(
    /(mongodb(?:\+srv)?:\/\/)[\s\S]*@/,
    '$1***:***@'
  );
}

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

NpmMongoTest = { redactMongoUrl };

// An app picks a different driver by adding one of these packages. Both are
// weak dependencies of npm-mongo, so either one loads first when present.
const legacyMongo = Package['npm-mongo-legacy'];
const nextMongo = Package['npm-mongo-next'];

if (legacyMongo && nextMongo) {
  throw new Error(
    'npm-mongo-legacy and npm-mongo-next select different MongoDB drivers ' +
    'and cannot be used together. Remove one of them with `meteor remove`.'
  );
}

const selectedMongo = nextMongo || legacyMongo;
const oldNoDeprecationValue = process.noDeprecation;

legacyMongo && console.log('WARN: npm-mongo-legacy package detected, using package for mongo <= 3.6');

try {
  // Silence deprecation warnings introduced in a patch update to mongodb:
  // https://github.com/meteor/meteor/pull/9942#discussion_r218564879
  process.noDeprecation = true;
  NpmModuleMongodb = selectedMongo
    ? selectedMongo.NpmModuleMongodb
    : Npm.require('mongodb');
} finally {
  process.noDeprecation = oldNoDeprecationValue;
}

NpmModuleMongodbVersion = selectedMongo
  ? selectedMongo.NpmModuleMongodbVersion
  : Npm.require('mongodb/package.json').version;
