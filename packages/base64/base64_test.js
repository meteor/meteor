var asciiToArray = function (str) {
  var arr = Base64.newBinary(str.length);
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c > 0xFF) {
      throw new Error("Not ascii");
    }
    arr[i] = c;
  }
  return arr;
};

var arrayToAscii = function (arr) {
  var res = [];
  for (var i = 0; i < arr.length; i++) {
    res.push(String.fromCharCode(arr[i]));
  }
  return res.join("");
};

Tinytest.add("base64 - testing the test", function (test) {
  test.equal(arrayToAscii(asciiToArray("The quick brown fox jumps over the lazy dog")),
             "The quick brown fox jumps over the lazy dog");
});

Tinytest.add("base64 - empty", function (test) {
  test.equal(Base64.encode(EJSON.newBinary(0)), "");
  test.equal(Base64.decode(""), EJSON.newBinary(0));
});


Tinytest.add("base64 - wikipedia examples", function (test) {
  var tests = [
    {txt: "pleasure.", res: "cGxlYXN1cmUu"},
    {txt: "leasure.", res: "bGVhc3VyZS4="},
    {txt: "easure.", res: "ZWFzdXJlLg=="},
    {txt: "asure.", res: "YXN1cmUu"},
    {txt: "sure.", res: "c3VyZS4="}
  ];
  _.each(tests, function(t) {
    test.equal(Base64.encode(asciiToArray(t.txt)), t.res);
    test.equal(arrayToAscii(Base64.decode(t.res)), t.txt);
  });
});

Tinytest.add("base64 - non-text examples", function (test) {
  var tests = [
    {array: [0, 0, 0], b64: "AAAA"},
    {array: [0, 0, 1], b64: "AAAB"}
  ];
  _.each(tests, function(t) {
    test.equal(Base64.encode(t.array), t.b64);
    var expectedAsBinary = EJSON.newBinary(t.array.length);
    _.each(t.array, function (val, i) {
      expectedAsBinary[i] = val;
    });
    test.equal(Base64.decode(t.b64), expectedAsBinary);
  });
});
