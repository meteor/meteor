// dgreenspan's minimal implementation of events.EventEmitter

toyevents = {
  EventEmitter: function EventEmitter() {
    this._listeners = {};
  }
};

toyevents.EventEmitter.prototype.addListener = function (type, f) {
  if (! f)
    return;
  this._listeners[type] = this._listeners[type] || [];
  this._listeners[type].push(f);
};

toyevents.EventEmitter.prototype.emit = function (type, data) {
  var funcs = this._listeners[type];
  if (! funcs)
    return;

  for (var i = 0, f; f = funcs[i]; i++)
    f(data);
};
