///
/// utility functions for computing progress of complex tasks
///
/// State callback here is an object with these keys:
///   done: bool, true if done
///   current: number, the current progress value
///   end: number, optional, the value of current where we expect to be done
///

var _ = require('underscore');
var Future = require('fibers/future');


var Progress = function (options) {
  var self = this;

  options = options || {};

  self._lastState = null;
  self._parent = options.parent;
  self._watchers = options.watchers || [];

  self._name = options.name;

  self._completedChildren = { current: 0, end: 0};
  self._activeChildTasks = [];
  self._selfState = { current: 0, end: undefined, done: false };
  if (options.estimate) {
    self._selfState.end = options.estimate;
  }
  self._state = _.clone(self._selfState);
};

_.extend(Progress.prototype, {
  // Creates a subtask that must be completed as part of this (bigger) task
  addChildTask: function (name, options) {
    var self = this;
    var options = _.extend({ name: name, parent: self }, options);
    var child = new Progress(options);
    self._activeChildTasks.push(child);
    self._reportChildState(child, child._state);
    return child;
  },

  dump: function (stream, prefix) {
    var self = this;

    if (prefix) {
      stream.write(prefix);
    }
    var end = self._state.end;
    if (!end) {
      end = '?';
    }
    stream.write("Task [" + self._name + "] " + self._state.current + "/" + end + (self._state.done ? " done" : "") + "\n");
    if (self._activeChildTasks.length) {
      _.each(self._activeChildTasks, function (child) {
        child.dump(stream, (prefix || '') + '  ');
      });
    }
  },

  // Receives a state report indicating progress of self
  reportState: function (state) {
    var self = this;

    self._selfState = state;

    self._state = self._computeTotalState();
    self._notifyState();
  },

  // Subscribes a watcher to changes
  addWatcher: function (watcher) {
    var self = this;

    self._watchers.push(watcher);
  },

  _notifyState: function () {
    var self = this;

    if (self._parent) {
      self._parent._reportChildState(self, self._state);
    }

    if (self._watchers.length) {
      _.each(self._watchers, function (watcher) {
        watcher(self._state);
      });
    }
  },

  _computeTotalState: function () {
    var self = this;

    var state = _.clone(self._selfState);

    state.current += self._completedChildren.current;
    if (state.end !== undefined) {
      state.end += self._completedChildren.end;
    }

    var allChildrenDone = true;
    _.each(self._activeChildTasks, function (child) {
      var childState = child._state;
      state.current += childState.current;
      if (!state.done) {
        allChildrenDone = false;
      }

      if (state.done) {
        if (state.end !== undefined) {
          state.end += childState.current;
        }
      } else if (state.end !== undefined) {
        if (childState.end !== undefined) {
          state.end += childState.end;
        } else {
          state.end = undefined;
        }
      }
    });
    if (!allChildrenDone) {
      state.done = false;
    }

    return state;
  },

  _reportChildState: function (child, state) {
    var self = this;

    if (state.done) {
      self._activeChildTasks = _.without(self._activeChildTasks, child);
      var weight = state.current;
      self._completedChildren.current += weight;
      self._completedChildren.end += weight;
    }

    self._state = self._computeTotalState();
    self._notifyState();
  }
});

exports.Progress = Progress;