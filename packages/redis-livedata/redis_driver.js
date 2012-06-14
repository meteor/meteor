var require = __meteor_bootstrap__.require;
var Redis = require('redis');
var Future = require('fibers/future');
var url = require('url');

Future.prototype.ret = Future.prototype.return;



_Redis = function(name) {
	this.name = name;
	this.db = _Redis.db
}

_Redis.setClient = function(u) {
	var parsed = url.parse(u || '');
	_Redis.db = Redis.createClient(parsed.port,parsed.host);
}


var PIC =  Object.create(Meteor._InvalidationCrossbar, {
	_matches: {
		value: function(notification, trigger) {
			return LocalStore.match(trigger, notification);
		}
	}
});

PIC.next_id = 1;
PIC.listeners = {};



_Redis.prototype._maybeBeginWrite = function () {
  var fence = Meteor._CurrentWriteFence.get();
  if (fence)
    return fence.beginWrite();
  else
    return {committed: function () {}};
};

_Redis.prototype.command = function (command, args) {
	var self = this;
	if (self.name === "___meteor_failure_test_store" &&
      document.fail) {
    var e = new Error("Failure test");
    e.expected = true;
    throw e;
  }
  if (! command in self.writes && ! command in self.reads)
  	throw new Error("" + command + " not supported");
  args[0] = self.name+':'+args[0];
	return this._command(command,args);
}

_Redis.prototype._command = function (command, args) {
	var self = this;
	var key = args[0];

  var finish;
  if (command in self.writes) {
  	var write = self._maybeBeginWrite();

		finish = Meteor.bindEnvironment(function () {

			//NOTE: replace Meteor.refresh
			var proxy_write = self._maybeBeginWrite();

			PIC.fire(key,function() {
				if (proxy_write)
					proxy_write.committed();
			});

	    write.committed();
	  }, function (e) {
	    Meteor._debug("Exception while completing redis update: " + e.stack);
	  });  
  }

  var future = new Future;
  self.db[command](args,function(err,res) {
  	if (!err) finish && finish();
  	future.ret([err,res]);
  });

  var result = future.wait();
  if (result[0]) throw result[0];
  return result[1];

}

_Redis.prototype._commands = function() {
	var self = this;

	var commands = [];
	return {
		add: function(command,args) {
			commands.push([command,args]);
		},
		exec: function() {
			var future = new Future;
			var multi = self.db.multi();

			var finish,write;
			for (var i = 0; i < commands.length; i++) {

				// Check if write is in set off commands
				if (!write && commands[i][0] in self.writes) {
					write = self._maybeBeginWrite();

					finish = Meteor.bindEnvironment(function () {

						//NOTE: replace Meteor.refresh
						var proxy_write = self._maybeBeginWrite();
						PIC.fire(key,function() {
							if (proxy_write)
								proxy_write.committed();
						});

				    write.committed();
				  }, function (e) {
				    Meteor._debug("Exception while completing redis update: " + e.stack);
				  });  
				}

				var args = commands[i][1];

				//add command to multi
				multi[commands[i][0]](args);
			}

			multi.exec(function(err,replies) {
				if (!err) finish && finish();
  			future.ret([err,replies]);
			});

			var result = future.wait();
		  if (result[0]) throw result[0];
		  return result[1];
		}
	}
}

_Redis.prototype.observe = function (key, options) {
	return new _Redis.LiveMatchSet(this, key, options)
}

_Redis.prototype.watch = function(key) {
	var self = this;
	return {
		_publish: function(sub) {
	    var observe_handle = self._publish_handle(
	    	_.bind(self.observe,self,key),
	    	self.name,sub);

	    sub.complete();
	    sub.flush();

	    // register stop callback (expects lambda w/ no args).
	    sub.onStop(_.bind(observe_handle.stop, observe_handle));
		}
	}
}

_Redis.LiveMatchSet = function (redis, key, options) {
	var self = this;

	options = options || {};

	self.type = options.type || 'hash';

	self.redis = redis;

	self.name = redis.name;
	self.matches = {};

	self.dirty = false;
	self.pending_writes = [];
	self.poll_running = false;
	self.polling_suspended = false;

	self._markDirty = _.throttle(self._unthrottled_markDirty, 50);

	self.key = key;

	self.crossbar_listener = PIC.listen(redis.name+':'+key,function (notification, complete) {
      // When someone does a transaction that might affect us,
      // schedule a poll of the database. If that transaction happens
      // inside of a write fence, block the fence until we've polled
      // and notified observers.
      var fence = Meteor._CurrentWriteFence.get();
      if (fence)
        self.pending_writes.push(fence.beginWrite());
      self._markDirty(notification);
      complete();
    });

  // user callbacks
  self.changed = options.changed;
  self.removed = options.removed;

  // run the first _poll() cycle synchronously.
  self.poll_running = true;
  self._doPoll();
  self.poll_running = false;

  // every once and a while, poll even if we don't think we're dirty,
  // for eventual consistency with database writes from outside the
  // Meteor universe
  self.refreshTimer = Meteor.setInterval(_.bind(self._markDirty, this),
                                         10 * 1000 /* 10 seconds */);

}

_Redis.LiveMatchSet.prototype._unthrottled_markDirty = function (key) {
  var self = this;
  self.dirty = true;
  if (self.polling_suspended)
    return; // don't poll when told not to
  if (self.poll_running)
    return; // only one instance can run at once. just tell it to re-cycle.
  self.poll_running = true;

  Fiber(function () {
    self.dirty = false;
    var writes_for_cycle = self.pending_writes;
    self.pending_writes = [];
    self._doPoll(key); // could yield, and set self.dirty
    _.each(writes_for_cycle, function (w) {w.committed();});

    self.poll_running = false;
    if (self.dirty || self.pending_writes.length)
      // rerun ourselves, but through _.throttle
      self._markDirty(key);
  }).run();
};

// interface for tests to control when polling happens
_Redis.LiveMatchSet.prototype._suspendPolling = function() {
  this.polling_suspended = true;
};
_Redis.LiveMatchSet.prototype._resumePolling = function() {
  this.polling_suspended = false;
  this._unthrottled_markDirty(); // poll NOW, don't wait
};

_Redis.prototype._read_command = function() {
	throw new Error("subclass must override");
}

_Redis.LiveMatchSet.prototype._doPoll = function (key) {
  var self = this;
  var new_matches;

  var read = self.redis._read_command;

  var old_matches = self.matches;
  if (key) {
  	var args = _.clone(read.args || []);
  	args.unshift(key);
  	var match = self.redis._command(read.cmd, args);
  	new_matches = old_matches;
  	var match_key = key.slice(key.indexOf(':')+1);
  	if (!match)
  		self.removed(match_key,old_matches[match_key]);
  	else if (!_.isEqual(match,old_matches[match_key])) {
  		self.changed(match_key,match,old_matches[match_key]);
  		new_matches[match_key] = match;
  	}
  } else {
  	var keys = self.redis.command('keys',[self.key]);
  	var replies = [];
  	if (keys) {
  		var commands = self.redis._commands();
	  	for (var i = 0; i < keys.length; i++) {
	  		commands.add(read.cmd, keys[i], read.args);
	  	}
	  	replies = commands.exec();
  	}
  	new_matches = {};
  	var match_key;
  	for (var i = 0; i < keys.length; i++) {
  		match_key = keys[i].slice(keys[i].indexOf(':')+1);
  		new_matches[match_key] = replies[i];
  	}

  	LocalStore._diffGet(old_matches, new_matches, self);

  }
  self.matches = new_matches;
  // Get the new query results
  //self.cursor.rewind();

};

_Redis.LiveMatchSet.prototype.stop = function () {
  var self = this;
  self.crossbar_listener.stop();
  Meteor.clearInterval(self.refreshTimer);
};

_.extend(Meteor, {
  _Redis: _Redis
});
