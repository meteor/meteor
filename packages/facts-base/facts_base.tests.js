Tinytest.add('facts-base - increments server facts', test => {
  Facts.incrementServerFact('newPackage', 'skyIsBlue', 42);
  test.equal(Facts._factsByPackage.newPackage, { skyIsBlue: 42 });

  Facts.incrementServerFact('newPackage', 'skyIsBlue', 21);
  test.equal(Facts._factsByPackage.newPackage, { skyIsBlue: 63 });

  Facts.incrementServerFact('newPackage', 'newFact', 7);
  test.equal(Facts._factsByPackage.newPackage, { skyIsBlue: 63, newFact: 7 });
});
