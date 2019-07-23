
type ProgressState = {
  done: boolean,
  current: number,
  end?: number,
};

type ProgressWatcher = (state: ProgressState) => void;

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
  private title: string | null;
  private isDone: boolean;
  private forkJoin?: boolean;

  private parent?: Progress;
  private watchers: ProgressWatcher[];

  private selfState: ProgressState;
  private state: ProgressState;

  private allTasks: Progress[];

  constructor(options) {
    options = options || {};

    this.parent = options.parent;
    this.watchers = options.watchers || [];
  
    this.title = options.title;
    if (this.title) {
      // Capitalize job titles when displayed in the progress bar.
      this.title = this.title[0].toUpperCase() + this.title.slice(1);
    }
  
    // XXX: Should we have a strict/mdg mode that enables this test?
    //if (!this.title && this.parent) {
    //  throw new Error("No title passed");
    //}
  
    this.forkJoin = options.forkJoin;
  
    this.allTasks = [];
  
    this.selfState = { current: 0, done: false };
    this.state = {...this.selfState};
  
    this.isDone = false;
  }

  toString() {
    return "Progress [state=" + JSON.stringify(this.state) + "]";
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
  getCurrentProgress(): Progress | null {
    var self = this;

    var isRoot = !self.parent;

    if (self.isDone) {
      // A done task cannot be the active task
      return null;
    }

    if (!self.state.done && (self.state.current != 0) && self.state.end &&
        !isRoot) {
      // We are not done and we have interesting state to report
      return self;
    }

    if (self.forkJoin) {
      // Don't descend into fork-join tasks (by choice)
      return self;
    }

    if (self.allTasks.length) {
      const active = self.allTasks
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
    self.allTasks.push(child);
    self._reportChildState(child, child.state);
    return child;
  }

  // Dumps the tree, for debug
  dump(
    stream: NodeJS.WriteStream,
    options: { skipDone?: boolean } = {},
    prefix: string,
  ) {
    var self = this;

    options = options || {};
    if (options.skipDone && self.isDone) {
      return;
    }

    if (prefix) {
      stream.write(prefix);
    }
    const end = self.state.end;
    stream.write("Task [" + self.title + "] " + self.state.current + "/" + (end || '?')
      + (self.isDone ? " done" : "") +"\n");
    
    self.allTasks.forEach(child => child.dump(stream, options, (prefix || '') + '  '));
  }

  // Receives a state report indicating progress of self
  reportProgress(state: ProgressState) {
    var self = this;

    self.selfState = state;

    self._updateTotalState();

    // Nudge the spinner/progress bar, but don't yield (might not be safe to yield)
    require('./console.js').Console.nudge(false);

    self._notifyState();
  }

  // Subscribes a watcher to changes
  addWatcher(watcher: (state: ProgressState) => void) {
    var self = this;

    self.watchers.push(watcher);
  }

  // Notifies watchers & parents
  _notifyState() {
    var self = this;

    if (self.parent) {
      self.parent._reportChildState(self, self.state);
    }

    self.watchers.forEach(watcher => watcher(self.state));
  }

  // Recomputes state, incorporating children's states
  _updateTotalState() {
    var self = this;

    var allChildrenDone = true;
    var state = {...self.selfState};

    self.allTasks.forEach(child => {
      var childState = child.state;

      if (!child.isDone) {
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

    self.isDone = allChildrenDone && !!self.selfState.done;
    if (!allChildrenDone) {
      state.done = false;
    }

    if (!state.done && self.state.done) {
      // This shouldn't happen
      throw new Error("Progress transition from done => !done");
    }

    self.state = state;
  }

  // Called by a child when its state changes
  _reportChildState(_child: Progress, _state: ProgressState) {
    this._updateTotalState();
    this._notifyState();
  }

  getState() {
    return this.state;
  }
}

export { Progress };
