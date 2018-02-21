import { Base64 } from './base64.js';

const asciiToArray = str => {
  const arr = Base64.newBinary(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 0xFF) {
      throw new Error("Not ascii");
    }

    arr[i] = c;
  }
  
  return arr;
};

const arrayToAscii = arr => arr
  .reduce(
    (prev, charCode) => prev.push(String.fromCharCode(charCode)) && prev, []
  ).join('');

Tinytest.add("base64 - testing the test", test => {
  test.equal(arrayToAscii(asciiToArray("The quick brown fox jumps over the lazy dog")),
             "The quick brown fox jumps over the lazy dog");
});

Tinytest.add("base64 - empty", test => {
  test.equal(Base64.encode(EJSON.newBinary(0)), "");
  test.equal(Base64.decode(""), EJSON.newBinary(0));
});


Tinytest.add("base64 - wikipedia examples", test => {
  const tests = [
    {txt: "pleasure.", res: "cGxlYXN1cmUu"},
    {txt: "leasure.", res: "bGVhc3VyZS4="},
    {txt: "easure.", res: "ZWFzdXJlLg=="},
    {txt: "asure.", res: "YXN1cmUu"},
    {txt: "sure.", res: "c3VyZS4="}
  ];
  tests.forEach(t => {
    test.equal(Base64.encode(asciiToArray(t.txt)), t.res);
    test.equal(arrayToAscii(Base64.decode(t.res)), t.txt);
  });
});

Tinytest.add("base64 - non-text examples", test => {
  const tests = [
    {array: [0, 0, 0], b64: "AAAA"},
    {array: [0, 0, 1], b64: "AAAB"}
  ];
  tests.forEach(t => {
    test.equal(Base64.encode(t.array), t.b64);
    const expectedAsBinary = EJSON.newBinary(t.array.length);
    t.array.forEach((val, i) => expectedAsBinary[i] = val);
    test.equal(Base64.decode(t.b64), expectedAsBinary);
  });
});
