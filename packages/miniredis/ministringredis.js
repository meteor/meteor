function LocalStringStore() {
	LocalStore.call(this);
}

LocalStringStore.prototype = Object.create(LocalStore.prototype);

LocalStringStore.prototype.reads = _.extend({
	get: function(key,options) {
		this._maybeReactive(key,options);
		return LocalCollection._deepcopy(this._store[key]);
	}
},LocalStore.prototype.reads);

LocalStringStore.prototype.writes = _.extend({
	set: function(key,value) {
		this._store[key] = ''+ value; //convert to string
	}
},LocalStore.prototype.writes);

LocalStringStore.prototype.update_msg = function(msg) {
	var self = this
	if (msg.set) {
		self.command('set',[msg.id,msg.set._value])
	} 

	if (msg.unset) {
		self.command('del',[msg.id])
	}

}
