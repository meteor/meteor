NpmModuleMongodb = Npm.require('mongodb');

// Hard-code the version number of our fork. When we un-fork, revert this
// change! Otherwise, NpmModuleMongodbVersion will either get the value of
// "2.2.31" or the fork's URL, depending on in what order npm processes the
// install commands.
// Previously:
// NpmModuleMongodbVersion = Npm.require('mongodb/package.json').version;
NpmModuleMongodbVersion = "2.2.31";
