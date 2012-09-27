_RedisString = function(name) {
	_Redis.call(this,name);
}

_RedisString.prototype = Object.create(_Redis.prototype);

_RedisString.prototype.writes = LocalStringStore.prototype.writes

_RedisString.prototype.reads = LocalStringStore.prototype.reads

_RedisString.prototype._publish_handle = function(observe,store,sub) {
	return observe({
		changed: function(key,value,old_value) {
			sub.set(store,key,{_value: value});
			sub.flush();
		},
		removed: function(key) {
			sub.unset(store,key,'_value');
			sub.flush();
		}
	});
}

_RedisString.prototype._read_command = {cmd: 'get'}


