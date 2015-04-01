try {
  NpmModuleNodeAesGcm = Npm.require('node-aes-gcm');
} catch (err) {
  if (process.platform === "win32" &&
    err.message.match(/specified module could not be found/)) {
    // the user probably doesn't have OpenSSL installed.
    throw new Error(
"Couldn't load the package 'npm-node-aes-gcm'. This is probably because you " +
"don't have OpenSSL installed. See the README for details and directions: " +
"https://github.com/meteor/meteor/blob/devel/packages/non-core/npm-node-aes-gcm/README.md");
  } else {
    throw err;
  }
}