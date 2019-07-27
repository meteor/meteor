// Use path instead of files.js here because we are explicitly trying to
// track requires, and files.js is often a culprit of slow requires.
var path = require('path');

// seconds since epoch
var now = function () {
  return (+ new Date)/1000;
};

var currentInvocation;
var RequireInvocation = function (name, filename) {
  var self = this;
  self.name = name; // module required
  self.filename = filename; // file doing the requiring, if known
  self.timeStarted = now();
  self.timeFinished = null;
  self.parent = currentInvocation;
  self.children = []; // array of RequireInvocation

  self.selfTime = null;
  self.totalTime = null;
};

RequireInvocation.prototype.isOurCode = function () {
  var self = this;

  if (! self.filename) {
    return self.name === 'TOP';
  }

  if (! self.name.match(/\//)) {
    // we always require our stuff via a path
    return false;
  }

  var ourSource = path.resolve(__dirname);
  var required = path.resolve(path.dirname(self.filename), self.name);
  if (ourSource.length > required.length) {
    return false;
  }
  return required.substr(0, ourSource.length) === ourSource;
};

RequireInvocation.prototype.why = function () {
  var self = this;
  var walk = self;
  var last = null;

  while (walk && ! walk.isOurCode()) {
    last = walk;
    walk = walk.parent;
  }

  if (! walk) {
    return "???";
  }
  if (last) {
    return path.basename(walk.name) + ":" + path.basename(last.name);
  }
  return path.basename(walk.name);
};

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
      inv.timeFinished = now();
      currentInvocation = parent;
    }
  };
};

exports.printReport = function () {
  currentInvocation.timeFinished = now();
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
