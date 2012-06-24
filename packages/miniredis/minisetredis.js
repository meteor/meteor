function LocalSetStore() {
	LocalStore.call(this);
}

LocalSetStore.prototype = Object.create(LocalStore.prototype);

LocalSetStore.prototype.reads = _.extend({
	scard: function(key) {
		if (!this._store[key]) 
			return 0
		_.keys(this._store[key]).length;
	},
	sismember: function(key,member) {
		if (!this._store[key]) 
			return false
		return !!this._store[key];
	},
	smembers: function(key) {
		if (!this._store[key])
			return [];
		return _.keys(this.store[key]);
	}
},LocalStore.prototype.reads);

LocalSetStore.prototype.writes = _.extend({
	sadd: function(key,member) {
		if (!this._store[key])
			this._store[key] = {};
		this._store[key][member] = true;
	},
	srem: function(key,member) {
		if (!this._store[key])
			return false
		if (member in this._store[key]) {
			delete this_store[key];
			return true
		} else {
			return false;
		}

	}
},LocalStore.prototype.writes);


LocalSetStore.prototype.update_msg = function(msg) {
	var self = this
	var doc = self._store[msg.id]
	if (doc
			&& !msg.set
			&& _.difference(_.keys(doc),msg.unset).length === 0) {
		self.command('del',[msg.id]);
	} else {
		if (msg.set)
			self.command('sadd',[msg.id,msg.set]);
		if (msg.unset) {
			var args = [key].concat(msg.unset);
			self.command('srem',args);
		}
	}
}