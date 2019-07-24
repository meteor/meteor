
type ProgressWatcher = (state: ProgressState) => void;

type ProgressOptions = {
  parent?: Progress,
  watchers?: ProgressWatcher[],
  title?: string,
  forkJoin?: boolean,
};

type ProgressState = {
  done: boolean,
  current: number,
  end?: number,
};

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
  private title: string | null | void;
  private isDone: boolean;
  private forkJoin?: boolean;

  private parent?: Progress;
  private watchers: ProgressWatcher[];

  private selfState: ProgressState;
  private state: ProgressState;

  private allTasks: Progress[];

  constructor(options: ProgressOptions = {}) {
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
    var isRoot = !this.parent;

    if (this.isDone) {
      // A done task cannot be the active task
      return null;
    }

    if (!this.state.done && (this.state.current != 0) && this.state.end &&
        !isRoot) {
      // We are not done and we have interesting state to report
      return this;
    }

    if (this.forkJoin) {
      // Don't descend into fork-join tasks (by choice)
      return this;
    }

    if (this.allTasks.length) {
      const active = this.allTasks
        .map(task => task.getCurrentProgress())
        .filter(Boolean);

      if (active.length) {
        // pick one to display, somewhat arbitrarily
        return active[active.length - 1];
      }

      // No single active task, return self
      return this;
    }

    return this;
  }

  // Creates a subtask that must be completed as part of this (bigger) task
  addChildTask(options: ProgressOptions = {}) {
    options = {
      parent: this,
      ...options,
    };
    var child = new Progress(options);
    this.allTasks.push(child);
    this._reportChildState(child, child.state);
    return child;
  }

  // Dumps the tree, for debug
  dump(
    stream: NodeJS.WriteStream,
    options: { skipDone?: boolean } = {},
    prefix: string,
  ) {
    options = options || {};
    if (options.skipDone && this.isDone) {
      return;
    }

    if (prefix) {
      stream.write(prefix);
    }
    const end = this.state.end;
    stream.write("Task [" + this.title + "] " + this.state.current + "/" + (end || '?')
      + (this.isDone ? " done" : "") +"\n");
    
    this.allTasks.forEach(child => child.dump(stream, options, (prefix || '') + '  '));
  }

  // Receives a state report indicating progress of self
  reportProgress(state: ProgressState) {
    this.selfState = state;

    this._updateTotalState();

    // Nudge the spinner/progress bar, but don't yield (might not be safe to yield)
    require('./console.js').Console.nudge(false);

    this._notifyState();
  }

  // Subscribes a watcher to changes
  addWatcher(watcher: (state: ProgressState) => void) {
    this.watchers.push(watcher);
  }

  // Notifies watchers & parents
  _notifyState() {
    if (this.parent) {
      this.parent._reportChildState(this, this.state);
    }

    this.watchers.forEach(watcher => watcher(this.state));
  }

  // Recomputes state, incorporating children's states
  _updateTotalState() {
    var allChildrenDone = true;
    var state = {...this.selfState};

    this.allTasks.forEach(child => {
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

    this.isDone = allChildrenDone && !!this.selfState.done;
    if (!allChildrenDone) {
      state.done = false;
    }

    if (!state.done && this.state.done) {
      // This shouldn't happen
      throw new Error("Progress transition from done => !done");
    }

    this.state = state;
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
