var selftest = require('../selftest.js');
var utils = require('../utils.js');

selftest.define('subset generator', function () {
  var out = [];
  utils.generateSubsetsOfIncreasingSize(['a', 'b', 'c'], function (x) {
    out.push(x);
  });
  selftest.expectEqual(out, [
    [],
    [ 'a' ],
    [ 'b' ],
    [ 'c' ],
    [ 'a', 'b' ],
    [ 'a', 'c' ],
    [ 'b', 'c' ],
    [ 'a', 'b', 'c' ]
  ]);
  out = [];
  utils.generateSubsetsOfIncreasingSize(['a', 'b', 'c'], function (x) {
    out.push(x);
    if (x[1] === 'c')
      return true;  // stop iterating
  });
  selftest.expectEqual(out, [
    [],
    [ 'a' ],
    [ 'b' ],
    [ 'c' ],
    [ 'a', 'b' ],
    [ 'a', 'c' ]
  ]);
});
