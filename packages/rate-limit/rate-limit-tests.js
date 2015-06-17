// Write your tests here!
// Here is an example.
Tinytest.add('example', function (test) {
  test.equal(true, true);
});

Tinytest.add('Check empty constructor creation', function (test) {
	r = new RateLimiter();
	test.equal(r.rules, []);
	test.equal(r.ruleId, 0);
	test.equal(r.ruleInvocationCounters, {});
});

Tinytest.add('Check single rule with multiple invocations, only 1 that matches', function (test) {
	r = new RateLimiter();
	var myUserId = 1;
	var rule1 = { userId: myUserId, IPAddr: null, method: null};

	r.addRule(rule1, 1, 1000);
	var connectionHandle = createTempConnectionHandle(123, '127.0.0.1')
	var methodInvc1 = createTempMethodInvocation(myUserId, connectionHandle, 'login');
	var methodInvc2 = createTempMethodInvocation(2, connectionHandle, 'login');
	for (var i = 0; i < 2; i++) {
		r.increment(methodInvc1);
		r.increment(methodInvc2);	
	}
	test.equal(r.check(methodInvc1).valid, false);
	test.equal(r.check(methodInvc2).valid, true);

	/* setTimeout(function () {
		for (var i = 0; i < 100; i++) {
			r.increment(methodInvc2);
		}

	test.equal(r.check(methodInvc1).valid, true);
	test.equal(r.check(methodInvc2).valid, true);
	}, 1000); */
}); 

/*testAsyncMulti("Run multiple invocations and wait for one to return", [
  function (test, expect) {
  	var self = this;
    self.r = new RateLimiter();
	self.myUserId = 1;
	self.rule1 = { userId: self.myUserId, IPAddr: null, method: null};

	self.r.addRule(self.rule1, 1, 1000);
	self.connectionHandle = createTempConnectionHandle(123, '127.0.0.1')
	self.methodInvc1 = createTempMethodInvocation(self.myUserId, self.connectionHandle, 'login');
	self.methodInvc2 = createTempMethodInvocation(2, self.connectionHandle, 'login');
	for (var i = 0; i < 2; i++) {
		self.r.increment(self.methodInvc1);
		self.r.increment(self.methodInvc2);	
	}
	test.equal(self.r.check(self.methodInvc1).valid, false);
	test.equal(self.r.check(self.methodInvc2).valid, true);
	setTimeout(expect(function(){}), 1000);
}, function (test, expect) {
	var self = this;
	for (var i = 0; i < 100; i++) {
		self.r.increment(self.methodInvc2);
	}
	
	test.equal(self.r.check(self.methodInvc1).valid, true);
	test.equal(self.r.check(self.methodInvc2).valid, true);
}]); */

Tinytest.add('Check two rules that affect same methodInvc still throw', function (test) { 
	r = new RateLimiter();
	var loginRule = { userId: null, IPAddr: null, method: 'login'};
	var userIdRule = { userId: function(userId) { return userId % 2 === 0}, IPAddr: null, method: null};
	r.addRule(loginRule, 10, 100);
	r.addRule(userIdRule, 4, 100);

	var connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
	var methodInvc1 = createTempMethodInvocation(1, connectionHandle, 'login');
	var methodInvc2 = createTempMethodInvocation(2, connectionHandle, 'login');
	var methodInvc3 = createTempMethodInvocation(3, connectionHandle, 'test');

	for (var i = 0; i < 5; i++) {
		r.increment(methodInvc1);
		r.increment(methodInvc2);
		r.increment(methodInvc3);	
	};

	// After for loop runs, we only have 10 runs, so that's under the limit
	test.equal(r.check(methodInvc1).valid, true);
	// However, this triggers userId rule since this userId is even
	test.equal(r.check(methodInvc2).valid, false);

	// Running one more test causes it to be false, since we're at 11 now.
	r.increment(methodInvc1);
	test.equal(r.check(methodInvc1).valid, false);
	test.equal(r.check(methodInvc3).valid, true);

});

Tinytest.add('Check two rules that are affected by different invocations', function (test) { 
	r = new RateLimiter();
	var loginRule = { userId: null, IPAddr: null, method: 'login'}
	r.addRule(loginRule, 10, 10000);

	var connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
	var methodInvc1 = createTempMethodInvocation(1, connectionHandle, 'login');
	var methodInvc2 = createTempMethodInvocation(2, connectionHandle, 'login');

	for (var i = 0; i < 5; i++) {
		r.increment(methodInvc1);
		r.increment(methodInvc2);	
	}
	r.increment(methodInvc1);

	test.equal(r.check(methodInvc1).valid, false);
	test.equal(r.check(methodInvc2).valid, false);
});

Tinytest.add("add global rule", function (test) {
	r = new RateLimiter();
	var globalRule = { userId: null, IPAddr: null, method: null}
	r.addRule(globalRule, 1, 10000);

	var connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
	var connectionHandle2 = createTempConnectionHandle(1234, '127.0.0.2');

	var methodInvc1 = createTempMethodInvocation(1, connectionHandle, 'login');
	var methodInvc2 = createTempMethodInvocation(2, connectionHandle2, 'test');
	var methodInvc3 = createTempMethodInvocation(3, connectionHandle, 'user-accounts');

	r.increment(methodInvc2);
	test.equal(r.check(methodInvc1).valid, true);
	test.equal(r.check(methodInvc2).valid, true);
	test.equal(r.check(methodInvc3).valid, true);
	r.increment(methodInvc3);
	test.equal(r.check(methodInvc1).valid, false);
	test.equal(r.check(methodInvc2).valid, false);
	test.equal(r.check(methodInvc3).valid, false);
})

function createTempConnectionHandle(id, clientIP) {
	return {
	    id: id,
	    close: function () {
	      self.close();
	    },
	    onClose: function (fn) {
	      var cb = Meteor.bindEnvironment(fn, "connection onClose callback");
	      if (self.inQueue) {
	        self._closeCallbacks.push(cb);
	      } else {
	        // if we're already closed, call the callback.
	        Meteor.defer(cb);
	      }
	    },
	    clientAddress: clientIP,
	    httpHeaders: null
	  };
}

function createTempMethodInvocation(userId, connectionHandle, methodName) {
	var methodInv = new DDPCommon.MethodInvocation({
        isSimulation: false,
        userId: userId,
        setUserId: null,
        unblock: false,
        connection: connectionHandle,
        randomSeed: 1234
      });
	methodInv.method = methodName;
	return methodInv;
}

