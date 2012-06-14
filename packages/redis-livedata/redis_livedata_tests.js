Tinytest.addAsync("redis-livedata - basics", function(test, onComplete) {
	var run = test.runId();
	var s;
	if (Meteor.is_client) {
		s = new Meteor.Store(null);
	} else {
		s = new Meteor.Store("livedata_test_store_"+run);
	}
	

	var log = '';
	var obs_obj = {
		changed: function(key,new_doc,old_doc) {
			if (old_doc)
				log += 'c(' + new_doc.x + ',' + old_doc.x + ')';
			else
				log += 'c(' + new_doc.x + ',undefined)';
		},
		removed: function(key,doc) {
			log += 'r(' + doc.x + ')';
		}
	}
	var obs = s.observe(run,obs_obj);

	var captureObserve = function (f) {
    if (Meteor.is_client) {
      f();
    } else {
      var fence = new Meteor._WriteFence;
      Meteor._CurrentWriteFence.withValue(fence, f);
      fence.armAndWait();
    }

    var ret = log;
    log = '';
    return ret;
  };

  var expectObserve = function (expected, f) {
    if (!(expected instanceof Array))
      expected = [expected];

    test.include(expected, captureObserve(f));
  };

	expectObserve('c(1,undefined)',function() {
		s.hset(run,'x',1);
		test.equal(s.hgetall(run).x,'1');
		test.equal(s.hget(run,'x'),'1');
	});

	if (Meteor.is_server) {
		obs.stop();
		s.observe(run,obs_obj);
		test.equal(log,'c(1,undefined)');
		log = '';
	}

	expectObserve('c(4,1)',function() {
		s.hset(run,'x',4);
		test.equal(s.hget(run,'x'),'4');
	});

	expectObserve('r(4)',function() {
		s.del(run);
	})



	obs.stop();
	onComplete();
});


//TODO: stop observe