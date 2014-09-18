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

  self._title = options.title;

  self._forkJoin = options.forkJoin;

  // XXX: Rationalize this; we probably don't need _completedChildren
  // XXX: or _activeChildTasks (?)
  self._completedChildren = { current: 0, end: 0};
  self._activeChildTasks = [];
  self._allTasks = [];

  self._selfState = { current: 0, end: 0, done: false };
  if (options.estimate) {
    self._selfState.end = options.estimate;
  }
  self._state = _.clone(self._selfState);

  self._isDone = false;

  self._selfActive = false;
};

_.extend(Progress.prototype, {
  reportProgressDone: function () {
    var self = this;

    var state = _.clone(self._selfState);
    state.done = true;

    self.reportProgress(state);
  },

  // Tries to determine which is the 'current' job in the tree
  // This is very heuristical... we use some hints, like:
  // don't descend into fork-join jobs; we know these execute concurrently,
  // so we assume the top-level task has the title
  // i.e. "Downloading packages", not "downloading supercool-1.0"
  getCurrentProgress: function () {
    var self = this;

    var isRoot = !self._parent;

    if (self._isDone) {
      return null;
    }

    if (self._selfActive && !isRoot) {
      return self;
    }

    if (self._forkJoin) {
      // Don't descend into fork-join tasks
      return self;
    }

    if (self._allTasks.length) {
      var active = _.map(self._allTasks, function (task) {
        return task.getCurrentProgress();
      });
      active = _.filter(active, function (s) {
        return !!s;
      });
      if (active.length == 1) {
        return active[0];
      }
      return self;
    }

    //if (self._activeChildTasks.length) {
    //  var titles = _.map(self._activeChildTasks, function (task) {
    //    return task.getCurrent();
    //  });
    //  titles = _.filter(titles, function (s) { return !!s; });
    //  if (titles.length == 1) {
    //    return titles[0];
    //  }
    //  //if (titles.length > 1) {
    //  //  console.log("Multiple titles: " + titles);
    //  //}
    //  return self._title;
    //}

    return null;
  },

  // Creates a subtask that must be completed as part of this (bigger) task
  addChildTask: function (options) {
    var self = this;
    options = options || {};
    var options = _.extend({ parent: self }, options);
    var child = new Progress(options);
    self._activeChildTasks.push(child);
    self._allTasks.push(child);
    self._reportChildState(child, child._state);
    return child;
  },

  // Dumps the tree, for debug
  dump: function (stream, prefix) {
    var self = this;

    if (prefix) {
      stream.write(prefix);
    }
    var end = self._state.end;
    if (!end) {
      end = '?';
    }
    stream.write("Task [" + self._title + "] " + self._state.current + "/" + end + (self._isDone ? " done" : "") + "\n");
    if (self._allTasks.length) {
      _.each(self._allTasks, function (child) {
        child.dump(stream, (prefix || '') + '  ');
      });
    }
  },

  // Receives a state report indicating progress of self
  reportProgress: function (state) {
    var self = this;

    self._selfState = state;

    self._state = self._computeTotalState();
    self._selfActive = !state.done;
    self._notifyState();
  },

  // Subscribes a watcher to changes
  addWatcher: function (watcher) {
    var self = this;

    self._watchers.push(watcher);
  },

  // Notifies watchers & parents
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

  // Recomputes state, incorporating children's states
  _computeTotalState: function () {
    var self = this;

    var state = _.clone(self._selfState);

    //state.current += self._completedChildren.current;
    //if (state.end !== undefined) {
    //  state.end += self._completedChildren.end;
    //}

    //var allChildrenDone = true;
    //_.each(self._activeChildTasks, function (child) {
    //  var childState = child._state;
    //  state.current += childState.current;
    //  if (!state.done) {
    //    allChildrenDone = false;
    //  }
    //
    //  if (state.done) {
    //    if (state.end !== undefined) {
    //      state.end += childState.current;
    //    }
    //  } else if (state.end !== undefined) {
    //    if (childState.end !== undefined) {
    //      state.end += childState.end;
    //    } else {
    //      state.end = undefined;
    //    }
    //  }
    //});
    //if (!allChildrenDone) {
    //  state.done = false;
    //}

    var allChildrenDone = true;
    var state = _.clone(self._selfState);
    _.each(self._allTasks, function (child) {
      var childState = child._state;

      if (!child._isDone) {
        allChildrenDone = false;
      }

      state.current += childState.current;
      if (state.end !== undefined) {
        if (childState.done) {
          state.end += childState.current;
        } else if (childState.end !== undefined) {
          state.end += childState.end;
        } else {
          state.end = undefined;
        }
      }
    });
    self._isDone = allChildrenDone && !self._selfActive;
    if (!allChildrenDone) {
      state.done = false;
    }

    return state;
  },

  // Called by a child when its state changes
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