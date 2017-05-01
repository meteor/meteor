var require = __meteor_bootstrap__.require;
var crypto = require('crypto');

//Accepts method = sha1, md5, sha256, sha512
Meteor.hash = function(method, data) {
  var hash = crypto.createHash(method);
  hash.update(data);
  return hash.digest('hex');
};