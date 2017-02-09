Tinytest.add('url - serializes params to query correctly', function (test) {
  var hash = {
    filter: {
      type: 'Foo',
      id_eq: 15,
    },
    array: ['1', 'a', 'dirty[]'],
    hasOwnProperty: 'horrible param name',
  };
  var query =
    'filter[type]=Foo&filter[id_eq]=15&array[]=1&array[]=a'
    + '&array[]=dirty%5B%5D&hasOwnProperty=horrible+param+name';
  test.equal(URL._encodeParams(hash), query);
});
