// Evaluate the packaged source with the real MongoDB parser. Only connection
// methods are intercepted, before evaluation, and restored in the same turn.
function evaluateMongoWrapper(source, mongoUrl, legacy) {
  var MongoClient = NpmModuleMongodb.MongoClient;
  var originalConnect = MongoClient.prototype.connect;
  var originalStaticConnect = MongoClient.connect;
  var connectionAttempts = 0;
  var warnings = [];
  var environment = {};
  if (mongoUrl !== undefined) {
    environment.MONGO_URL = mongoUrl;
  }
  var context = {
    process: { env: environment, noDeprecation: false },
    Package: legacy ? { 'npm-mongo-legacy': legacy } : {},
    console: {
      log: function () {},
      warn: function () {
        warnings.push(Array.prototype.slice.call(arguments));
      }
    },
    Npm: {
      require: function (name) {
        if (name === 'mongodb') return NpmModuleMongodb;
        if (name === 'mongodb/package.json') {
          return { version: NpmModuleMongodbVersion };
        }
        throw new Error('Unexpected wrapper dependency: ' + name);
      }
    }
  };
  function interceptedConnect() {
    connectionAttempts += 1;
    return Promise.resolve(this);
  }

  try {
    MongoClient.prototype.connect = interceptedConnect;
    MongoClient.connect = interceptedConnect;
    Npm.require('vm').runInNewContext(source, context, {
      filename: 'npm-mongo/wrapper.js'
    });
  } finally {
    MongoClient.prototype.connect = originalConnect;
    MongoClient.connect = originalStaticConnect;
  }
  return {
    connectionAttempts: connectionAttempts,
    warnings: warnings,
    context: context
  };
}

function mongoWrapperTest(name, run) {
  Tinytest.addAsync('npm-mongo - ' + name, function (test, done) {
    Assets.getTextAsync('wrapper.js').then(function (source) {
      try {
        run(test, source);
      } catch (error) {
        test.exception(error);
      } finally {
        done();
      }
    }, function (error) {
      test.exception(error);
      done();
    });
  });
}

mongoWrapperTest('package evaluation does not connect to MONGO_URL', function (test, source) {
  [
    'mongodb://user:password@localhost:27017/database',
    'mongodb://user:password@localhost:27017/database?tls=false',
    'mongodb://user:password@localhost:27017/database?tls=true',
    'mongodb+srv://user:password@cluster.example/database',
    undefined,
    'https://example.com'
  ].forEach(function (mongoUrl) {
    var result = evaluateMongoWrapper(source, mongoUrl);
    test.equal(result.connectionAttempts, 0, mongoUrl);
    test.equal(result.warnings, [], mongoUrl);
    test.isTrue(result.context.NpmModuleMongodb === NpmModuleMongodb);
    test.equal(result.context.NpmModuleMongodbVersion, NpmModuleMongodbVersion);
    test.isFalse(result.context.process.noDeprecation);
  });
});

mongoWrapperTest('invalid credential-bearing MONGO_URL is not logged', function (test, source) {
  [
    'mongodb://user:cs17-secret@localhost:abc/db',
    'mongodb://user:cs17-secret@localhost/db?tls=maybe',
    'mongodb://user:cs17-secret%E0%A4%A@localhost/db',
    'mongodb://user:cs17-secret@localhost/db?authMechanism=NOPE',
    'mongodb+srv://user:cs17-secret@localhost:27017/db',
    'mongodb://user:cs17-secret@tail@localhost:abc/db'
  ].forEach(function (mongoUrl) {
    var result = evaluateMongoWrapper(source, mongoUrl);
    var warningText = JSON.stringify(result.warnings);
    test.equal(result.connectionAttempts, 0);
    test.equal(result.warnings, [[
      'Invalid MongoDB connection string in MONGO_URL'
    ]]);
    test.equal(warningText.indexOf(mongoUrl), -1);
    test.equal(warningText.indexOf('cs17-secret'), -1);
    test.isTrue(result.context.NpmModuleMongodb === NpmModuleMongodb);
    test.isFalse(result.context.process.noDeprecation);
  });
});

mongoWrapperTest('preserves the legacy driver export', function (test, source) {
  var legacy = {
    NpmModuleMongodb: { legacy: true },
    NpmModuleMongodbVersion: 'legacy-test-version'
  };
  var result = evaluateMongoWrapper(source,
    'mongodb://user:password@localhost:27017/database', legacy);
  test.equal(result.connectionAttempts, 0);
  test.equal(result.warnings, []);
  test.isTrue(result.context.NpmModuleMongodb === legacy.NpmModuleMongodb);
  test.equal(result.context.NpmModuleMongodbVersion, legacy.NpmModuleMongodbVersion);
  test.isFalse(result.context.process.noDeprecation);
});
