Tinytest.add("babel - run - template literals", function (test) {
  var dump = function (pieces) {
    return [_.extend({}, pieces),
            _.toArray(arguments).slice(1)];
  };
  var foo = 'B';
  test.equal(`\u0041${foo}C`, 'ABC');
  test.equal(dump`\u0041${foo}C`,
             [{0:'A', 1: 'C', raw: {value: ['\\u0041', 'C']}},
              ['B']]);
});
