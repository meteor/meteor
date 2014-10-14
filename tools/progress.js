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
var console = require('./console.js');

var Progress = function (options) {
  var self = this;

  options = options || {};

  self._lastState = null;
  self._parent = options.parent;
  self._watchers = options.watchers || [];

  self._title = options.title;

  // XXX: Should we have a strict/mdg mode that enables this test?
  //if (!self._title && self._parent) {
  //  throw new Error("No title passed");
  //}

  self._forkJoin = options.forkJoin;

  self._allTasks = [];

  self._selfState = { current: 0, done: false };
  self._state = _.clone(self._selfState);

  self._isDone = false;

  self._selfActive = false;
};

_.extend(Progress.prototype, {
  toString: function() {
    var self = this;
    return "Progress [state=" + JSON.stringify(self._state) + "]";
  },

  reportProgressDone: function () {
    var self = this;

    var state = _.clone(self._selfState);
    state.done = true;
    if (state.end !== undefined) {
      if (state.current > state.end) {
        state.end = state.current;
      }
      state.current = state.end;
    }
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

    return null;
  },

  // Creates a subtask that must be completed as part of this (bigger) task
  addChildTask: function (options) {
    var self = this;
    options = options || {};
    var options = _.extend({ parent: self }, options);
    var child = new Progress(options);
    self._allTasks.push(child);
    self._reportChildState(child, child._state);
    return child;
  },

  // Dumps the tree, for debug
  dump: function (stream, options, prefix) {
    var self = this;

    options = options || {};
    if (options.skipDone && self._isDone) {
      return;
    }

    if (prefix) {
      stream.write(prefix);
    }
    var end = self._state.end;
    if (!end) {
      end = '?';
    }
    stream.write("Task [" + self._title + "] " + self._state.current + "/" + end
      + (self._isDone ? " done" : "")
      + (self._selfActive ? " active" : "") +"\n");
    if (self._allTasks.length) {
      _.each(self._allTasks, function (child) {
        child.dump(stream, options, (prefix || '') + '  ');
      });
    }
  },

  // Receives a state report indicating progress of self
  reportProgress: function (state) {
    var self = this;

    self._selfState = state;
    self._selfActive = !state.done;

    self._updateTotalState();

    console.Console.nudge(false);

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
  _updateTotalState: function () {
    var self = this;

    var state = _.clone(self._selfState);

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

    if (!state.done && self._state.done) {
      // This shouldn't happen
      throw new Error("Progress transition from done => !done");
    }

    self._state = state;
  },

  // Called by a child when its state changes
  _reportChildState: function (child, state) {
    var self = this;

    self._updateTotalState();
    self._notifyState();
  }
});

exports.Progress = Progress;