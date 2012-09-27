LocalStore = function() {
	this._store = {};

	this.next_gid = 1;

	this.gets = {};

	this.current_snapshot = null;

	this.paused = false;
}

LocalStore.prototype.reads = {
  keys: function(pattern) {
    var self = this;
    var keys = [];
    Object.keys(this._store).forEach(function(key) {
      if (self.match(pattern,key)) keys.push(key);
    })
  },
  exists: function(key) {
    return this._store[key] !== undefined;
  }
}

LocalStore.prototype.writes = {
  del: function(key) {
    delete this._store[key];
  }
}

LocalStore.prototype._maybeReactive = function(key,options) {
  var self = this;
  options = options || {};
  if (typeof Meteor === "object" && Meteor.deps &&
      (options.reactive === undefined || options.reactive))
      self._markAsReactive(key,{changed:true});
}

LocalStore.prototype.count = function() {
  return Object.keys(this._store).length;
}

LocalStore.match = function (pattern, key) {
  if (pattern[pattern.length-1] === '*') {
    if (pattern.length === 1) return true;
    return key.indexOf(pattern.slice(0,-1)) == 0;
  } else {
    return pattern === key;
  }
}

// the handle that comes back from observe.
LocalStore.LiveResult = function () {};

LocalStore.prototype.observe = function(pattern,options) {
	var self = this;

	var gid = self.next_gid++;

	var get = self.gets[gid] = {
		key: pattern,
		matches: self._getMatches(pattern),
		matches_snapshot: null,
	};

	// wrap callbacks we were passed. callbacks only fire when not paused
  // and are never undefined.
  var if_not_paused = function (f) {
    if (!f)
      return function () {};
    return function (/*args*/) {
      if (!self.paused)
        f.apply(this, arguments);
    };
  };

	get.changed = if_not_paused(options.changed);
  get.removed = if_not_paused(options.removed);

	if (!options._suppress_initial && !self.paused)
    for(var key in get.matches)
		  get.changed(key,LocalCollection._deepcopy(get.matches[key]));

	var handle = new LocalStore.LiveResult;
  _.extend(handle, {
    collection: self,
    stop: function () {
      delete self.gets[gid];
    }
  });
  return handle;
}

LocalStore.prototype._getMatches = function (pattern) {
  var self = this;

  if (pattern[pattern.length-1] === '*') {
    var matches = {};
    for (var key in self._store) {
      if (LocalStore.match(pattern,key))
        matches[key] = self._store[key];
    }
    return matches;
  } else if (key in self._store) {
    return {key: self._store[key]};
  } else {
    return {};
  }
}

LocalStore.prototype._markAsReactive = function(key,options) {
	var self = this;

	var context = Meteor.deps.Context.current;
	if (!context) return;

	var invalidate = _.bind(context.invalidate,context);
	var handle = self.observe(key,{ changed: options.changed && invalidate,
                              removed: options.removed && invalidate,
                             _suppress_initial: true});
	context.on_invalidate(handle.stop);
}



LocalStore.prototype.command = function (command, args) {
  args[0] = '' + args[0]; //convert key to string
  if (command in this.reads) return this.reads[command].apply(this,args);
  else if (command in this.writes) return this.write(command,args);
  else throw new Error("" + command + " not supported");
}

LocalStore.prototype.write = function(command,args) {
  var self = this;
  var key = args[0];
  var old_value = LocalCollection._deepcopy(self._store[key]);
  this.writes[command].apply(this,args);

  var value = self._store[key];

  for (var gid in self.gets) {
    var get = self.gets[gid];
    if(LocalStore.match(get.key,key))  {
      if (value) {
        get.matches[key] = value;
        get.changed(key,LocalCollection._deepcopy(value), old_value)
      } else {
        delete get.matches[key];
        get.removed(key,old_value);
      }
    }
  }
}

LocalStore.prototype.removeAll = function() {
  var self = this;

  Object.keys(self._store).forEach(function(key) {
    self.remove(key);
  });
}

// At most one snapshot can exist at once. If one already existed,
// overwrite it.
// XXX document (at some point)
// XXX test
// XXX obviously this particular implementation will not be very efficient
LocalStore.prototype.snapshot = function () {
  this.current_snapshot = {};
  for (var key in this._store)
    this.current_snapshot[key] = JSON.parse(JSON.stringify(this._store[key]));
};

// Restore (and destroy) the snapshot. If no snapshot exists, raise an
// exception.
// XXX document (at some point)
// XXX test
LocalStore.prototype.restore = function () {
  if (!this.current_snapshot)
    throw new Error("No current snapshot");
  this._store = this.current_snapshot;
  this.current_snapshot = null;

  // Rerun all queries from scratch. (XXX should do something more
  // efficient -- diffing at least; ideally, take the snapshot in an
  // efficient way, say with an undo log, so that we can efficiently
  // tell what changed).


  for (var gid in this.gets) {
    var get = this.gets[gid];

    var old_matches = get.matches;

    get.matches = this._getMatches(get.key);

    if (!this.paused)
      LocalStore._diffGet(old_matches, get.matches, get, true);
  }
};


// Pause the observers. No callbacks from observers will fire until
// 'resumeObservers' is called.
LocalStore.prototype.pauseObservers = function () {
  // No-op if already paused.
  if (this.paused)
    return;

  // Set the 'paused' flag such that new observer messages don't fire.
  this.paused = true;

  // Take a snapshot of the query results for each query.
  for (var gid in this.gets) {
    var get = this.gets[gid];

    get.matches_snapshot = LocalCollection._deepcopy(get.matches);
  }
};

// Resume the observers. Observers immediately receive change
// notifications to bring them to the current state of the
// database. Note that this is not just replaying all the changes that
// happened during the pause, it is a smarter 'coalesced' diff.
LocalStore.prototype.resumeObservers = function () {
  // No-op if not paused.
  if (!this.paused)
    return;

  // Unset the 'paused' flag. Make sure to do this first, otherwise
  // observer methods won't actually fire when we trigger them.
  this.paused = false;

  for (var gid in this.gets) {
    var get = this.gets[gid];
    // Diff the current results against the snapshot and send to observers.
    // pass the query object for its observer callbacks.
    LocalStore._diffGet(get.matches_snapshot, get.matches, get, true);
    get.result_snapshot = null;
  }

};

LocalStore._diffGet = function(old_matches, new_matches, observer, deepcopy) {
	var mdc = (deepcopy ? LocalCollection._deepcopy : _.identity);

  for (var key in new_matches) {
    if (!_.isEqual(new_matches[key],old_matches[key]))
      observer.changed(key,mdc(new_matches[key]),old_matches[key]);
  }

  _.difference(Object.keys(old_matches),Object.keys(new_matches))
    .forEach(function(key) {
      observer.removed(key,old_matches[key]);
    });

}
