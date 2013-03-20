var asciiToArray = function (str) {
  var arr = EJSON.newBinary(str.length);
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
  test.equal(EJSON._base64Encode(EJSON.newBinary(0)), "");
  test.equal(EJSON._base64Decode(""), EJSON.newBinary(0));
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
    test.equal(EJSON._base64Encode(asciiToArray(t.txt)), t.res);
    test.equal(arrayToAscii(EJSON._base64Decode(t.res)), t.txt);
  });
});
