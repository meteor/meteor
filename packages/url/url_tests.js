Tinytest.add('url - serializes params to query correctly', function (test) {
  var hash = {
    filter: {
      type: 'Foo',
      id_eq: 15,
    },
    array: ['1', 'a', 'dirty[]']
  };
  var query =
    'filter[type]=Foo&filter[id_eq]=15&array[0]=1&array[1]=a&array[2]=dirty%5B%5D';
  test.equal(URL._encodeParams(hash), query);
});
