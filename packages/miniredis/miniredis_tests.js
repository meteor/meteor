Tinytest.add("ministringredis - basics", function(test) {
	var s = new LocalStringStore();

	s.command('set',['kitten','fluffy']);
	test.equal(s.command('get',['kitten']),'fluffy');

	s.command('del',['kitten']);
	test.equal(s.command('get',['kitten']),undefined);
	
});

Tinytest.add('minihashredis - basics', function(test) {
	var s = new LocalHashStore();

	s.command('hset',['kitten','hair','fluffy']);
	test.equal(s.command('hget',['kitten','hair']),'fluffy');
	test.equal(s.command('hgetall',['kitten']),{hair: 'fluffy'});

	s.command('hmset', ['kitten', {color: 'black', weight: '5'}]);
	test.equal(s.command('hgetall',['kitten']), {hair: 'fluffy', color: 'black', weight: '5'});
});

var log_callbacks = function (operations) {
  return {
    changed: function (key, obj, old_obj) {
      operations.push(LocalCollection._deepcopy(['changed', key, obj, old_obj]));
    },
    removed: function (id, old_obj) {
      operations.push(LocalCollection._deepcopy(['removed', id, old_obj]));
    }
  };
};

Tinytest.add("ministringredis - observe", function (test) {
	var operations = [];
	var cbs = log_callbacks(operations);

	var s = new LocalStringStore();
	var handle = s.observe('a',cbs);

	test.equal(operations.shift(),undefined);

	s.command('set',['a',1]);
	test.equal(operations.shift(),['changed','a','1', undefined]);

	s.command('set',['a',2]);
	test.equal(operations.shift(),['changed','a','2', '1']);

	s.command('del',['a']);
	test.equal(operations.shift(),['removed','a','2']);

	handle.stop();
	s.command('set',['a',2]);
	test.equal(operations.shift(),undefined);
});

Tinytest.add("minihashredis - observe", function(test) {
	var operations = [];
	var cbs = log_callbacks(operations);

	var s = new LocalHashStore();
	var handle = s.observe('a',cbs);


	s.command('hmset',['a',{num: '1', let: 'b'}]);
	test.equal(operations.shift(),['changed','a',{num:'1', let:'b'},undefined]);

});

Tinytest.add("ministringredis - observe pattern", function(test) {
	var operations = [];
	var cbs = log_callbacks(operations);

	var s = new LocalStringStore();
	var handle = s.observe('*',cbs);

	s.command('set',['ab',1]);
	test.equal(operations.shift(),['changed','ab','1', undefined]);
	handle.stop();

	var handle = s.observe('a*',cbs);
	test.equal(operations.shift(),['changed','ab','1', undefined]);
	s.command('set',['ab',2]);
	test.equal(operations.shift(),['changed','ab','2', '1']);
});

Tinytest.add("miniredis - diff", function(test) {
	var operations = [];
	var cbs = log_callbacks(operations);

	LocalStore._diffGet(
		{1: {hair: 'fluffy', traits: ['black',5]}}, 
		{1: {hair: 'fluffy', traits: ['black',5]}},
		cbs);
	test.equal(operations.shift(),undefined);

	LocalStore._diffGet(
		{1: {hair: 'fluffy', traits: ['black',5]}}, 
		{1: {hair: 'fluffy', traits: ['black',6]}},
		cbs);
	test.equal(operations.shift(),['changed','1',{hair: 'fluffy', traits: ['black',6]},{hair: 'fluffy', traits: ['black',5]}]);

	LocalStore._diffGet(
		{1: {hair: 'fluffy', traits: ['black',5]}}, 
		{},
		cbs);
	test.equal(operations.shift(),['removed','1',{hair: 'fluffy', traits: ['black',5]}]);


});

Tinytest.add("miniredis - snapshot", function (test) {
	var operations = [];
	var cbs = log_callbacks(operations);

	var s = new LocalHashStore();
	var h = s.observe('*',cbs);

	test.equal(s.count(),0);
	test.length(operations,0);
	s.snapshot();
	test.equal(s.count(),0);
	test.length(operations,0);
	s.restore();
	test.equal(s.count(),0);
	test.length(operations,0);

	// snapshot empty, set new docs
  s.snapshot();
  test.equal(s.count(), 0);

  s.command('hset',[1,'a',1]);
  test.equal(s.count(), 1);
  test.equal(operations.shift(), ['changed', '1',{a:'1'}, undefined]);
  s.command('hset',[2,'b',2]);
  test.equal(s.count(), 2);
  test.equal(operations.shift(), ['changed', '2',{b:'2'}, undefined]);

  s.restore();

  test.equal(s.count(), 0);
  test.equal(operations.shift(), ['removed', '1', {a:'1'}]);
  test.equal(operations.shift(), ['removed', '2', {b:'2'}]);

  // snapshot with contents. see we get update and remove.
  // depends on observer update order from diffGet.
  // reorder test statements if this changes.

  s.command('hset',[1,'a',1]);
  test.equal(s.count(), 1);
  test.equal(operations.shift(), ['changed', '1',{a:'1'}, undefined]);
  s.command('hset',[2,'b',2]);
  test.equal(s.count(), 2);
  test.equal(operations.shift(), ['changed', '2',{b:'2'}, undefined]);

  s.snapshot();
  test.equal(s.count(), 2);

  s.command('hdel',[1]);
  test.equal(s.count(), 1);
  test.equal(operations.shift(), ['removed', '1', {a:'1'}]);
  s.command('hset',[3,'c',3]);
  test.equal(s.count(), 2);
  test.equal(operations.shift(), ['changed', '3',{c:'3'}, undefined]);
  s.command('hset',[2,'b',4]);
  test.equal(operations.shift(), ['changed', '2', {b:'4'}, {b:'2'}]);

  s.restore();
  test.equal(s.count(), 2);
  test.equal(operations.shift(), ['changed', '1',{a:'1'}, undefined]);
  test.equal(operations.shift(), ['changed', '2',{b:'2'}, {b:'4'}]);
  test.equal(operations.shift(), ['removed', '3', {c:'3'}]);

  // snapshot with stuff. restore immediately. no changes.

  test.equal(s.count(), 2);
  test.length(operations, 0);
  s.snapshot();
  test.equal(s.count(), 2);
  test.length(operations, 0);
  s.restore();
  test.equal(s.count(), 2);
  test.length(operations, 0);

});

Tinytest.add("miniredis - pause", function(test) {
	var operations = [];
	var cbs = log_callbacks(operations);

	var s = new LocalHashStore();
	var h = s.observe('*',cbs);

	s.command('hset',[1,'a',1]);
	test.equal(operations.shift(), ['changed', '1',{a:'1'}, undefined]);

	s.pauseObservers();
	s.command('hdel',[1]);
	test.length(operations,0);
	s.command('hset',[1,'a',1]);
	test.length(operations,0);

	// two modifications become one
  s.pauseObservers();

  s.command('hset',[1,'a',2]);
  s.command('hset',[1,'a',3]);

  s.resumeObservers();
  test.equal(operations.shift(), ['changed', '1',{a:'3'}, {a:'1'}]);
  test.length(operations, 0);

  // snapshot/restore, same results
  s.snapshot();

  s.command('hset',[2,'b',2]);
  test.equal(operations.shift(), ['changed', '2',{b:'2'}, undefined]);

  s.pauseObservers();
  s.restore();
  s.command('hset',[2,'b',2]);
  test.length(operations, 0);

  s.resumeObservers();
  test.length(operations, 0);

	// snapshot/restore, different results
  s.snapshot();

  s.command('hset',[3,'c',3]);
  test.equal(operations.shift(), ['changed', '3',{c:'3'}, undefined]);

  s.pauseObservers();
  s.restore();
  s.command('hset',[3,'c',4]);
  test.length(operations, 0);

  s.resumeObservers();
  test.equal(operations.shift(), ['changed', '3',{c:'4'}, {c:'3'}]);
  test.length(operations, 0);  


});
