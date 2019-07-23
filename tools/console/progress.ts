///
/// utility functions for computing progress of complex tasks
///
/// State callback here is an object with these keys:
///   done: bool, true if done
///   current: number, the current progress value
///   end: number, optional, the value of current where we expect to be done
///
/// If end is not set, we'll display a spinner instead of a progress bar
///
class Progress {
  constructor(options) {
    options = options || {};

    this._lastState = null;
    this._parent = options.parent;
    this._watchers = options.watchers || [];
  
    this._title = options.title;
    if (this._title) {
      // Capitalize job titles when displayed in the progress bar.
      this._title = this._title[0].toUpperCase() + this._title.slice(1);
    }
  
    // XXX: Should we have a strict/mdg mode that enables this test?
    //if (!this._title && this._parent) {
    //  throw new Error("No title passed");
    //}
  
    this._forkJoin = options.forkJoin;
  
    this._allTasks = [];
  
    this._selfState = { current: 0, done: false };
    this._state = {...this.selfState};
  
    this._isDone = false;
  
    this.startTime = +(new Date);
  }

  toString() {
    return "Progress [state=" + JSON.stringify(this._state) + "]";
  }

  reportProgressDone() {
    var state = {...this.selfState};
    state.done = true;
    if (state.end !== undefined) {
      if (state.current > state.end) {
        state.end = state.current;
      }
      state.current = state.end;
    }
    this.reportProgress(state);
  }

  // Tries to determine which is the 'current' job in the tree
  // This is very heuristical... we use some hints, like:
  // don't descend into fork-join jobs; we know these execute concurrently,
  // so we assume the top-level task has the title
  // i.e. "Downloading packages", not "downloading supercool-1.0"
  getCurrentProgress() {
    var self = this;

    var isRoot = !self._parent;

    if (self._isDone) {
      // A done task cannot be the active task
      return null;
    }

    if (!self._state.done && (self._state.current != 0) && self._state.end &&
        !isRoot) {
      // We are not done and we have interesting state to report
      return self;
    }

    if (self._forkJoin) {
      // Don't descend into fork-join tasks (by choice)
      return self;
    }

    if (self._allTasks.length) {
      const active = self._allTasks
        .map(task => task.getCurrentProgress())
        .filter(Boolean);

      if (active.length) {
        // pick one to display, somewhat arbitrarily
        return active[active.length - 1];
      }
      // No single active task, return self
      return self;
    }

    return self;
  }

  // Creates a subtask that must be completed as part of this (bigger) task
  addChildTask(options) {
    var self = this;
    options = {
      parent: self,
      ...options,
    };
    var child = new Progress(options);
    self._allTasks.push(child);
    self._reportChildState(child, child._state);
    return child;
  }

  // Dumps the tree, for debug
  dump(stream, options, prefix) {
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
      + (self._isDone ? " done" : "") +"\n");
    
    self._allTasks.forEach(child => child.dump(stream, options, (prefix || '') + '  '));
  }

  // Receives a state report indicating progress of self
  reportProgress(state) {
    var self = this;

    self._selfState = state;

    self._updateTotalState();

    // Nudge the spinner/progress bar, but don't yield (might not be safe to yield)
    require('./console.js').Console.nudge(false);

    self._notifyState();
  }

  // Subscribes a watcher to changes
  addWatcher(watcher) {
    var self = this;

    self._watchers.push(watcher);
  }

  // Notifies watchers & parents
  _notifyState() {
    var self = this;

    if (self._parent) {
      self._parent._reportChildState(self, self._state);
    }

    self._watchers.forEach(watcher => watcher(self._state));
  }

  // Recomputes state, incorporating children's states
  _updateTotalState() {
    var self = this;

    var allChildrenDone = true;
    var state = {...self._selfState};

    self._allTasks.forEach(child => {
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

    self._isDone = allChildrenDone && !!self._selfState.done;
    if (!allChildrenDone) {
      state.done = false;
    }

    if (!state.done && self._state.done) {
      // This shouldn't happen
      throw new Error("Progress transition from done => !done");
    }

    self._state = state;
  }

  // Called by a child when its state changes
  _reportChildState(child, state) {
    this._updateTotalState();
    this._notifyState();
  }

  getState() {
    return this._state;
  }
}

export { Progress };
