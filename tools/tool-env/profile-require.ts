// Use path instead of files.ts here because we are explicitly trying to
// track requires, and files.ts is often a culprit of slow requires.
import path from 'path';

// seconds since epoch
const getNow = () => Date.now() / 1000;

let currentInvocation: RequireInvocation;

class RequireInvocation {
  public timeStarted: number;
  public timeFinished: number | null;
  parent: RequireInvocation;
  children: RequireInvocation[];
  selfTime: number | null;
  totalTime: number | null;

  /**
   * @param name module required
   * @param filename file doing the requiring, if known
   */
  constructor(
    public name: string,
    private filename: string | null = null
  ) {
    this.timeStarted = getNow();
    this.timeFinished = null;
    this.parent = currentInvocation;
    this.children = [];
  
    this.selfTime = null;
    this.totalTime = null;
  }

  isOurCode(): boolean {
    if (!this.filename) {
      return this.name === 'TOP';
    }
  
    if (!this.name.match(/\//)) {
      // we always require our stuff via a path
      return false;
    }
  
    const ourSource = path.resolve(__dirname);
    const required = path.resolve(path.dirname(this.filename), this.name);
    if (ourSource.length > required.length) {
      return false;
    }
    return required.substr(0, ourSource.length) === ourSource;
  }

  why(): string {
    let walk: RequireInvocation = this;
    let last: RequireInvocation | null = null;
  
    while (walk && ! walk.isOurCode()) {
      last = walk;
      walk = walk.parent;
    }
  
    if (!walk) {
      return "???";
    }
    if (last) {
      return `${path.basename(walk.name)}:${path.basename(last.name)}`;
    }
    return path.basename(walk.name);
  }
}

export function start() {
  const moduleModule = require('module');
  currentInvocation = new RequireInvocation('TOP');

  const realLoader = moduleModule._load;
  moduleModule._load = function (...args: [string, { filename?: string }]) {
    const [id, { filename }] = args;
    const inv = new RequireInvocation(id, filename);
    const parent = currentInvocation;

    currentInvocation.children.push(inv);
    currentInvocation = inv;

    try {
      return realLoader.apply(this, args);
    } finally {
      inv.timeFinished = getNow();
      currentInvocation = parent;
    }
  };
}

/**
 * The discrepancy in computed times that we are willing to tolerate
 * before deciding that the times don't add up.
 */
const TOLERANCE = 1/1000;

export function printReport() {
  currentInvocation.timeFinished = getNow();
  computeTimes(currentInvocation);

  const summary = summarize(currentInvocation, 0);
  const times = Object.values(summary).sort((a, b) => 
    b.time - a.time
  );

  let ourTotal = 0, otherTotal = 0;

  times.forEach(item => {
    let line = `${formatTime(item.time)} ${item.name}`;

    if (!item.ours) {
      line += ` [via ${Object.keys(item.via).join(', ')}]`;
    }

    console.log(line);

    if (item.ours) {
      ourTotal += item.time;
    } else {
      otherTotal += item.time;
    }
  })

  const grandTotal = currentInvocation.totalTime || 0;
  if (grandTotal - ourTotal - otherTotal > TOLERANCE) {
    throw new Error("Times don't add up");
  }
  
  console.log("TOTAL: ours " + formatTime(ourTotal) +
              ", other " + formatTime(otherTotal) +
              ", grand total " + formatTime(grandTotal));
}

function computeTimes(inv: RequireInvocation) {
  inv.totalTime = inv.timeFinished! - inv.timeStarted;

  let childTime = 0;
  inv.children.forEach(child => {
    computeTimes(child);
    childTime += child.totalTime!;
  });

  if (inv.totalTime !== null) {
    inv.selfTime = inv.totalTime - childTime;
  }
};

type Summary = Record<string, {
  name: string;
  time: number;
  ours: boolean;
  via: Record<string, boolean>;
}>;

function summarize(inv: RequireInvocation, depth: number, summary: Summary = {}) {
  if (!(inv.name in summary)) {
    summary[inv.name] = {
      name: inv.name,
      time: 0,
      ours: inv.isOurCode(),
      via: {}
    };
  }

  summary[inv.name].time += inv.selfTime || 0;
  if (!inv.isOurCode()) {
    summary[inv.name].via[inv.why()] = true;
  }

  inv.children.forEach(inv => {
    summarize(inv, depth + 1, summary);
  })

  return summary;
};

/**
 * Formats time in seconds for display in milliseconds.
 */
function formatTime(time: number) {
  return (time * 1000).toFixed(2);
}