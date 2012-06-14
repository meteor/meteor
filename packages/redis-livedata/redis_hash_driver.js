_RedisHash = function(name) {
	_Redis.call(this,name);
}

_RedisHash.prototype = Object.create(_Redis.prototype);

_RedisHash.prototype.writes = LocalHashStore.prototype.writes

_RedisHash.prototype.reads = LocalHashStore.prototype.reads

_RedisHash.prototype._publish_handle = function(observe,store,sub) {
	return observe({
		changed: function(key,obj,old_obj) {
			var set = {};
			_.each(obj, function (v, k) {
        if (!old_obj || !_.isEqual(v, old_obj[k]))
          set[k] = v;
      });
			sub.set(store,key,set);
			var dead_fields = _.difference(_.keys(old_obj || {}), _.keys(obj));
      sub.unset(store, key, dead_fields);
			sub.flush();
		},
		removed: function(key,old_obj) {
			sub.unset(store,key,_.keys(old_obj));
			sub.flush();
		}
	});
}

_RedisHash.prototype._read_command = {cmd: 'hgetall'}