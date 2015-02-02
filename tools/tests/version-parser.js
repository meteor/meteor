var _ = require('underscore');
var utils = require('../utils.js');
var selftest = require('../selftest.js');


selftest.define("release management - default orderKey", function () {
  var t = function (cases) {
    _.each(cases, function (c) {
      var version = c[0];
      var expectedOrderKey = c[1];
      var actualOrderKey = utils.defaultOrderKeyForReleaseVersion(version);
      selftest.expectEqual(actualOrderKey, expectedOrderKey);
    });
  };

  t([
    ['1', '0001$'],
    ['0', '0000$'],
    ['01', null],
    ['', null],
    ['1.2.3', '0001.0002.0003$'],
    ['42.123', '0042.0123$'],
    ['1234', '1234$'],
    ['12345', null],
    ['123.012', null],
    ['1.2.3-preview', '0001.0002.0003!preview!!!!!!!!$'],
    ['1.2.3.4-AbCdEfG-HiJkLmO', '0001.0002.0003.0004!AbCdEfG-HiJkLmO$'],
    ['1.2.3.4-AbCdEfG-HiJkLmOp', null],
    ['1.2.3.4-AbCdEfG-HiJkLmO0', '0001.0002.0003.0004!AbCdEfG-HiJkLmO0000$'],
    ['1.2.3.4-AbCdEfG-HiJkLmO01', null],
    ['1.2.3.4-AbCdEfG-HiJkLmO12345', null],
    ['1.2.3.4-AbCdEfG-HiJkLmO15', '0001.0002.0003.0004!AbCdEfG-HiJkLmO0015$'],
    ['1.2.3.4-rc2', '0001.0002.0003.0004!rc!!!!!!!!!!!!!0002$'],
    ['1.2.3.4-2rc', null],
    ['1.2.3.4r', null]
  ]);

  var ordered = [
    '1.2',
    '1.2.0',
    '1.2.1',
    '1.2.1.4',
    '1.2.2',
    '1.2.15',
    '1.15.2',
    '1.15.3-preview',
    '1.15.3-preview2',
    '1.15.3-preview15',
    '1.15.3-rc',
    '1.15.3-rc2',
    '1.15.3-rc15',
    '1.15.3-rd15',
    '1.15.3-rda15',
    '1.15.3',
    '2'
  ];

  for (var i = 0; i < ordered.length - 1; ++i) {
    var first = utils.defaultOrderKeyForReleaseVersion(ordered[i]);
    var next = utils.defaultOrderKeyForReleaseVersion(ordered[i + 1]);
    selftest.expectEqual(first !== null, true);
    selftest.expectEqual(next !== null, true);
    selftest.expectEqual(first < next, true);
  }
});
