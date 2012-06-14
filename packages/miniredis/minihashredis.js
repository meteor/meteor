function LocalHashStore() {
	LocalStore.call(this);
}

LocalHashStore.prototype = Object.create(LocalStore.prototype);

LocalHashStore.prototype.reads = _.extend({
	hget: function(key,field, options) {
		this._maybeReactive(key,options);
		if (this._store[key]) 
			return LocalCollection._deepcopy(this._store[key][field]);
	},

	hgetall: function(key, options) {
		this._maybeReactive(key,options);
		return LocalCollection._deepcopy(this._store[key]);
	}
},LocalStore.prototype.reads);

LocalHashStore.prototype.writes = _.extend({
	hset: function(key,field,value) {
		field = '' + field;
		value = '' + value;
		if (!this._store[key]) this._store[key] = {};
		this._store[key][field] = value;
	},
	hmset: function(key,value) {
		if (!this._store[key]) this._store[key] = {};
		var doc = this._store[key];

		if ('object' == typeof value) {
			Object.keys(value).forEach(function(key) {
				doc[''+key] = '' + value[key];
			});
		} else {
			var args = _.toArray(arguments);
			args.shift();
			var i = 0;
			while (i < args.length) {
				doc[''+args[i]] = ''+args[++i];
				i++;
			}
		}
	},
	hdel: function(key,field) {
		var fields = _.toArray(arguments).slice(1);
		if (this._store[key]) {
			_.each(fields,function(field) {
				delete this._store[key][field]
			});
		}
	}
},LocalStore.prototype.writes);


LocalHashStore.prototype.update_msg = function(msg) {
	var self = this
	var doc = self._store[msg.id]
	if (doc
			&& !msg.set
			&& _.difference(_.keys(doc),msg.unset).length === 0) {
		self.command('del',[msg.id]);
	} else {
		if (msg.set)
			self.command('hmset',[msg.id,msg.set]);
		if (msg.unset) {
			var args = [key].concat(msg.unset);
			self.command('hdel',args);
		}
	}
	
}