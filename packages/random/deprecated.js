// Before this package existed, we used to use this Meteor.uuid()
// implementing the RFC 4122 v4 UUID. It is no longer documented
// and will go away.
// XXX COMPAT WITH 0.5.6
Meteor.uuid = function () {
  var HEX_DIGITS = "0123456789abcdef";
  var s = [];
  for (var i = 0; i < 36; i++) {
    s[i] = Random.choice(HEX_DIGITS);
  }
  s[14] = "4";
  s[19] = HEX_DIGITS.substr((parseInt(s[19],16) & 0x3) | 0x8, 1);
  s[8] = s[13] = s[18] = s[23] = "-";

  var uuid = s.join("");
  return uuid;
};
