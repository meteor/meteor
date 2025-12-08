// XXX SECTION: Meta tests

Tinytest.add("test-helpers - try_all_permutations", function (test) {
  // Have a good test of try_all_permutations, because it would suck
  // if try_all_permutations didn't actually run anything and so none
  // of our other tests actually did any testing.

  var out = "";
  try_all_permutations(
    function () {out += ":";},
    [
      function () {out += "A";},
      function () {out += "B";},
      function () {out += "C";}
    ],
    function () {out += ".";}
  );

  test.equal(out, ":ABC.:ACB.:BAC.:BCA.:CAB.:CBA.");

  out = "";
  try_all_permutations(
    [function () {out += ":";}],
    [
      2,
      function () {out += "A";},
      function () {out += "B";},
      function () {out += "C";}
    ],
    [],
    [
      0,
      function () {out += "X";},
      function () {out += "Y";}
    ],
    function () {out += ".";}
  );

  test.equal(out, ":AB.:AC.:BA.:BC.:CA.:CB.");

  out = "";
  try_all_permutations(
    [
      2,
      function () {out += "A";},
      function () {out += "B";},
      function () {out += "C";},
      function () {out += "D";}
    ],
    [
      function () {out += "X";},
      function () {out += "Y";}
    ],
    function () {out += ".";}
  );
  test.equal(out, "ABXY.ABYX.ACXY.ACYX.ADXY.ADYX.BAXY.BAYX.BCXY.BCYX.BDXY.BDYX.CAXY.CAYX.CBXY.CBYX.CDXY.CDYX.DAXY.DAYX.DBXY.DBYX.DCXY.DCYX.");

  var examine = function (n) {
    var fs = [];
    var seq = "";
    var seen = {};

    for (var i = 0; i < n; i++)
      fs.push((function (x) { seq += x + "_"; }).bind(null, i));
    try_all_permutations(
      function () {seq = "";},
      fs,
      function () {
        if (seq in seen)
          throw new Error("duplicate permutation");
        seen[seq] = true;
      }
    );

    var expected_count = 1;
    for (var i = n; i >= 1; i--)
      expected_count *= i;
    test.equal(Object.keys(seen).length, expected_count);
  };

  for (var i = 1; i <= 5; i++)
    examine(i);

  try_all_permutations();
});
