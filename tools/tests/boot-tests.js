var selftest = require('../selftest.js');

selftest.define("boot utils", function (options) {
  var bootUtils = require('../server/boot-utils.js');
  selftest.expectTrue(bootUtils.validPid(123));
  selftest.expectTrue(bootUtils.validPid("123"));
  selftest.expectTrue(bootUtils.validPid(0x123));
  selftest.expectTrue(bootUtils.validPid("0x123"));

  selftest.expectFalse(bootUtils.validPid("foo123"));
  selftest.expectFalse(bootUtils.validPid("foobar"));
  selftest.expectFalse(bootUtils.validPid("123foo"));
});
