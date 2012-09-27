_RedisSet = function(name) {
	_Redis.call(this,name);
}
Ï
_RedisSet.prototype = Object.create(_Redis.prototype);

_RedisSet.prototype.writes = LocalSetStore.prototype.writes

_RedisSet.prototype.reads = LocalSetStore.prototype.reads

_RedisSet.prototype._publish_handle = function(observe,store,sub) {
	return observe({
		changed: function(key,obj,old_obj) {
			var new_members = _.difference(_.keys(obj),_.keys(old_obj || {}))
			sub.set(store,key,set);
			var dead_members = _.difference(_.keys(old_obj || {}), _.keys(obj));
      sub.unset(store, key, dead_members);
			sub.flush();
		},
		removed: function(key,old_obj) {
			sub.unset(store,key,_.keys(old_obj));
			sub.flush();
		}
	});
}

_RedisSet.prototype._read_command = {cmd: 'smembers'}