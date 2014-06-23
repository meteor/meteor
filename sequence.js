// splice out one element of array that is `=== element` (if present)
var spliceOut = function (array, element) {
  for (var i = array.length - 1; i >= 0; i--) {
    if (array[i] === element) {
      array.splice(i, 1);
      break;
    }
  }
};

Blaze.Sequence = function (array) {
  if (! (this instanceof Blaze.Sequence))
    // called without new
    return new Blaze.Sequence(array);

  // clone `array`
  this.items = (array ? Array.prototype.slice.call(array) : []);
  this.observers = [];
  this.dep = new Deps.Dependency;
};

_.extend(Blaze.Sequence.prototype, {
  get: function (k) {
    var items = this.items;
    if (! (k >= 0 && k < items.length))
      throw new Error("Bad index in Blaze.Sequence#get: " + k);
    return items[k];
  },
  size: function () {
    return this.items.length;
  },
  addItem: function (item, k) {
    var self = this;
    var items = self.items;
    if (! (k >= 0 && k <= items.length))
      throw new Error("Bad index in Blaze.Sequence#addItem: " + k);

    items.splice(k, 0, item);
    self.dep.changed();

    var observers = self.observers;
    for (var i = 0; i < observers.length; i++)
      observers[i].addItem(item, k);
  },
  removeItem: function (k) {
    var self = this;
    var items = self.items;
    if (! (k >= 0 && k < items.length))
      throw new Error("Bad index in Blaze.Sequence#removeItem: " + k);

    items.splice(k, 1);
    self.dep.changed();

    var observers = self.observers;
    for (var i = 0; i < observers.length; i++)
      observers[i].removeItem(k);
  },
  moveItem: function (oldIndex, newIndex) {
    var self = this;
    var items = self.items;
    if (! (oldIndex >= 0 && oldIndex < items.length))
      throw new Error("Bad index in Blaze.Sequence#moveItem: " + oldIndex);
    if (! (newIndex >= 0 && newIndex < items.length))
      throw new Error("Bad index in Blaze.Sequence#moveItem: " + newIndex);
    if (oldIndex === newIndex)
      return;

    var item = items[oldIndex];
    items.splice(oldIndex, 1);
    items.splice(newIndex, 0, item);
    self.dep.changed();

    var observers = self.observers;
    for (var i = 0; i < observers.length; i++) {
      var obs = observers[i];
      if (obs.moveItem) {
        obs.moveItem(oldIndex, newIndex);
      } else {
        obs.removeItem(oldIndex);
        obs.addItem(item, newIndex);
      }
    }
  },
  observeMutations: function (callbacks) {
    var self = this;
    self.observers.push(callbacks);

    var handle = {
      stop: function () {
        spliceOut(self.observers, callbacks);
      }
    };

    if (Deps.active) {
      Deps.onInvalidate(function () {
        handle.stop();
      });
    }

    return handle;
  },
  depend: function () {
    this.dep.depend();
  }
});
