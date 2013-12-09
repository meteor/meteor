PasswordPBKDF2 = {};

// XXX Choose this more carefully -- 100,000 should be safe, but we should
// really set it as high as we're willing to go.
var numIterations = 100000;

var keyLen = 32;

if (Meteor.isServer) {
  var crypto = Npm.require("crypto");

  PasswordPBKDF2.hash = function (password, salt) {
    if (! salt)
      salt = Random.hexString(64);
    var result = crypto.pbkdf2Sync(
      password,
      new Buffer(salt, "hex"),
      numIterations,
      keyLen
    );
    return {
      salt: salt,
      hash: result.toString("hex"),
      numIterations: numIterations
    };
  };

  PasswordPBKDF2.check = function (unhashed, hashed) {
    var check = PasswordPBKDF2.hash(unhashed, hashed.salt);
    var match = true;
    for (var i = 0; i < hashed.hash.length; i++) {
      if (check.hash[i] !== hashed.hash[i])
        match = false;
    }
    return match;
  };
}
