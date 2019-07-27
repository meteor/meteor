// Use path instead of files.ts here because we are explicitly trying to
// track requires, and files.ts is often a culprit of slow requires.
import path from 'path';

// seconds since epoch
const getNow = () => Date.now() / 1000;

let currentInvocation: RequireInvocation;

class RequireInvocation {
  timeStarted: number;
  timeFinished: number | null;
  parent: RequireInvocation;
  children: RequireInvocation[];
  selfTime: number | null;
  totalTime: number | null;

  constructor(
    public name: string, // module required
    private filename: string | null // file doing the requiring, if known
  ) {
    this.timeStarted = getNow();
    this.timeFinished = null;
    this.parent = currentInvocation;
    this.children = [];
  
    this.selfTime = null;
    this.totalTime = null;
  }

  isOurCode() {
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

  why() {
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

exports.start = function () {
  var moduleModule = require('module');
  currentInvocation = new RequireInvocation('TOP');

  var realLoader = moduleModule._load;
  moduleModule._load = function (...args) {
    var [id, { filename }] = args;
    var inv = new RequireInvocation(id, filename);
    var parent = currentInvocation;
    currentInvocation.children.push(inv);
    currentInvocation = inv;

    try {
      return realLoader.apply(this, args);
    } finally {
      inv.timeFinished = getNow();
      currentInvocation = parent;
    }
  };
};

exports.printReport = function () {
  currentInvocation.timeFinished = getNow();
  var _ = require('underscore');

  var computeTimes = function (inv) {
    inv.totalTime = inv.timeFinished - inv.timeStarted;

    var childTime = 0;
    _.each(inv.children, function (child) {
      computeTimes(child);
      childTime += child.totalTime;
    });

    if (inv.totalTime !== null) {
      inv.selfTime = inv.totalTime - childTime;
    }
  };
  computeTimes(currentInvocation);

  var summary = {};
  var summarize = function (inv, depth) {
    // var padding = (new Array(depth*2 + 1)).join(' ');
    // console.log(padding + inv.name + " [" + inv.selfTime + "]");
    if (! (inv.name in summary)) {
      summary[inv.name] = { name: inv.name, time: 0, ours: inv.isOurCode(),
                            via: {} };
    }
    summary[inv.name].time += inv.selfTime;
    if (! inv.isOurCode()) {
      summary[inv.name].via[inv.why()] = true;
    }

    _.each(inv.children, function (inv) {
      summarize(inv, depth + 1);
    });
  };
  summarize(currentInvocation, 0);

  var times = _.sortBy(_.values(summary), 'time').reverse();
  var ourTotal = 0, otherTotal = 0;
  _.each(times, function (item) {
    var line = (item.time * 1000).toFixed(2) + " " + item.name;
    if (! item.ours) {
      line += " [via " + _.keys(item.via).join(", ") + "]";
    }
    console.log(line);
    if (item.ours) {
      ourTotal += item.time;
    } else {
      otherTotal += item.time;
    }
  });


  var grandTotal = currentInvocation.totalTime;
  if (grandTotal - ourTotal - otherTotal > 1/1000) {
    throw new Error("Times don't add up");
  }
  console.log("TOTAL: ours " + (ourTotal * 1000).toFixed(2) +
              ", other " + (otherTotal * 1000).toFixed(2) +
              ", grand total " + (grandTotal * 1000).toFixed(2));
};
