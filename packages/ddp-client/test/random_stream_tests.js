Tinytest.add('livedata - DDP.randomStream', function(test) {
  var randomSeed = Random.id();
  var context = { randomSeed: randomSeed };

  var sequence = DDP._CurrentMethodInvocation.withValue(context, function() {
    return DDP.randomStream('1');
  });

  var seeds = sequence.alea.args;

  test.equal(seeds.length, 2);
  test.equal(seeds[0], randomSeed);
  test.equal(seeds[1], '1');

  var id1 = sequence.id();

  // Clone the sequence by building it the same way RandomStream.get does
  var sequenceClone = Random.createWithSeeds.apply(null, seeds);
  var id1Cloned = sequenceClone.id();
  var id2Cloned = sequenceClone.id();
  test.equal(id1, id1Cloned);

  // We should get the same sequence when we use the same key
  sequence = DDP._CurrentMethodInvocation.withValue(context, function() {
    return DDP.randomStream('1');
  });
  seeds = sequence.alea.args;
  test.equal(seeds.length, 2);
  test.equal(seeds[0], randomSeed);
  test.equal(seeds[1], '1');

  // But we should be at the 'next' position in the stream
  var id2 = sequence.id();

  // Technically these could be equal, but likely to be a bug if hit
  // http://search.dilbert.com/comic/Random%20Number%20Generator
  test.notEqual(id1, id2);

  test.equal(id2, id2Cloned);
});

Tinytest.add('livedata - DDP.randomStream with no-args', function(test) {
  DDP.randomStream().id();
});
