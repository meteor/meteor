type ProgressWatcher = (state: ProgressState) => void;

type ProgressOptions = {
  parent?: Progress;
  watchers?: ProgressWatcher[];
  title?: string;
  forkJoin?: boolean;
};

type ProgressState = {
  done: boolean; // true if job is done
  current: number; // the current progress value
  end?: number; // the value of current where we expect to be done
};

/**
 * Utility class for computing the progress of complex tasks.
 *
 * Watchers are invoked with a ProgressState object.
 */
export class Progress {
  public readonly title?: string;
  public readonly startTime = Date.now();

  private parent: Progress | null;
  private allTasks: Progress[] = [];
  private selfState: ProgressState = { current: 0, done: false };
  private state: ProgressState = { current: 0, done: false };
  private isDone = false;
  private watchers: ProgressWatcher[];
  private forkJoin: boolean;

  constructor(options: ProgressOptions = {}) {
    this.parent = options.parent || null;
    this.watchers = options.watchers || [];
    this.forkJoin = !!options.forkJoin;

    if ((this.title = options.title)) {
      // Capitalize job titles when displayed in the progress bar.
      this.title = this.title[0].toUpperCase() + this.title.slice(1);
    }
  }

  toString() {
    return "Progress [state=" + JSON.stringify(this.state) + "]";
  }

  reportProgressDone() {
    const state = {
      ...this.selfState,
      done: true,
    };

    if (typeof state.end !== 'undefined') {
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
    const isRoot = !this.parent;

    if (this.isDone) {
      // A done task cannot be the active task
      return null;
    }

    if (!this.state.done && (this.state.current !== 0) && this.state.end &&
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
  addChildTask(options: ProgressOptions) {
    options = {
      parent: this,
      ...options,
    };
    const child = new Progress(options);
    this.allTasks.push(child);
    this.reportChildState();
    return child;
  }

  // Dumps the tree, for debug
  dump(
    stream: NodeJS.WriteStream,
    options?: { skipDone: boolean },
    prefix?: string,
  ) {
    if (options && options.skipDone && this.isDone) {
      return;
    }

    if (prefix) {
      stream.write(prefix);
    }
    const end = this.state.end || '?';
    stream.write("Task [" + this.title + "] " + this.state.current + "/" + end
      + (this.isDone ? " done" : "") +"\n");
    if (this.allTasks.length) {
      this.allTasks.forEach(child => {
        child.dump(stream, options, (prefix || '') + '  ');
      });
    }
  }

  // Receives a state report indicating progress of self
  reportProgress(state: ProgressState) {
    this.selfState = state;

    this.updateTotalState();

    // Nudge the spinner/progress bar, but don't yield (might not be safe to yield)
    const { Console } = require("./console.js");

    Console.nudge();

    this.notifyState();
  }

  // Subscribes a watcher to changes
  addWatcher(watcher: ProgressWatcher) {
    this.watchers.push(watcher);
  }

  // Notifies watchers & parents
  private notifyState() {
    if (this.parent) {
      this.parent.reportChildState();
    }

    if (this.watchers.length) {
      this.watchers.forEach(watcher => {
        watcher(this.state);
      });
    }
  }

  // Recomputes state, incorporating children's states
  private updateTotalState() {
    let allChildrenDone = true;
    const state = { ...this.selfState };
    this.allTasks.forEach(child => {
      const childState = child.state;

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
  private reportChildState() {
    this.updateTotalState();
    this.notifyState();
  }

  getState() {
    return this.state;
  }
}
