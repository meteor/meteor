var fs = Npm.require('fs');
var Future = Npm.require('fibers/future');


var MONITOR_INTERVAL = 5*1000; // every 5 seconds

/**
 * Follower.connect() replaces DDP.connect() for connecting to DDP services that
 * implement a leadership set.  The follower connection tries to keep connected
 * to the leader, and fails over as the leader changes.
 *
 * Options: {
 * group: The name of the leadership group to connect to.  Default "package.leadershipLivedata"
 * }
 *
 * A Follower connection implements the following interfaces over and above a
 * normal DDP connection:
 *
 * onLost(callback): calls callback when the library considers itself to have
 * tried all its known options for the leadership group.
 *
 * onFound(callback): Called when the follower was previously lost, but has now
 * successfully connected to something in the right leadership group.
 */
Follower = {
  connect: function (urlSet, options) {
    var electorTries;
    options = _.extend({
      group: "package.leadershipLivedata"
    }, options);
    // start each elector as untried/assumed connectable.

    var makeElectorTries = function (urlSet) {

      electorTries = {};
      if (typeof urlSet === 'string') {
        urlSet = _.map(urlSet.split(','), function (url) {return url.trim();});
      }
      _.each(urlSet, function (url) {
        electorTries[url] = 0;
      });
    };

    makeElectorTries(urlSet);

    var tryingUrl = null;
    var outstandingGetElectorate = false;
    var conn = null;
    var prevReconnect = null;
    var prevDisconnect = null;
    var prevApply = null;
    var leader = null;
    var connectedTo = null;
    var intervalHandle = null;


    // Used to defer all method calls until we're sure that we connected to the
    // right leadership group.
    var connectedToLeadershipGroup = new Future();

    var lost = false;
    var lostCallbacks = [];
    var foundCallbacks = [];

    var findFewestTries = function () {
      var min = 10000;
      var minElector = null;
      _.each(electorTries, function (tries, elector) {
        if (tries < min) {
          min = tries;
          minElector = elector;
        }
      });
      if (min > 1 && !lost) {
        // we've tried everything once; we just became lost.
        lost = true;
        _.each(lostCallbacks, function (f) { f(); });
      }
      return minElector;
    };

    var updateElectorate = function (res) {
      leader = res.leader;
      electorTries = {};
      _.each(res.electorate, function (elector) {
        electorTries[elector] = 0; // verified that this is in the current elector set.
      });
    };

    var tryElector = function (url) {
      if (tryingUrl) {
        electorTries[tryingUrl]++;
      }
      url = url || findFewestTries();
      //console.log("trying", url, electorTries, tryingUrl, process.env.GALAXY_JOB);

      // Don't keep trying the same url as fast as we can if it's not working.
      if (electorTries[url] > 2) {
        Meteor._sleepForMs(3 * 1000);
      }

      if (conn) {
        prevReconnect.apply(conn, [{
          url: url
        }]);
      } else {
        conn = DDP.connect(url, options);
        prevReconnect = conn.reconnect;
        prevDisconnect = conn.disconnect;
        prevApply = conn.apply;
      }
      tryingUrl = url;

      if (!outstandingGetElectorate) {
        outstandingGetElectorate = true;
        conn.call('getElectorate', options.group, function (err, res) {
          outstandingGetElectorate = false;
          connectedTo = tryingUrl;
          if (err) {
            tryElector();
            return;
          }
          if (!_.contains(res.electorate, connectedTo)) {
            Log.warn("electorate " + res.electorate + " does not contain " + connectedTo);
          }
          tryingUrl = null;
          if (! connectedToLeadershipGroup.isResolved()) {
            connectedToLeadershipGroup["return"]();
          }
          // we got an answer!  Connected!
          electorTries[url] = 0;

          if (res.leader === connectedTo) {
            // we're good.
            if (lost) {
              // we're found.
              lost = false;
              _.each(foundCallbacks, function (f) { f(); });
            }
          } else {
            // let's connect to the leader anyway, if we think it
            // is connectable.
            if (electorTries[res.leader] == 0) {
              tryElector(res.leader);
            } else {
              // XXX: leader is probably down, we're probably going to elect
              // soon.  Wait for the next round.
            }

          }
          updateElectorate(res);
        });
      }

    };

    tryElector();

    var checkConnection = function () {
      if (conn.status().status !== 'connected' || connectedTo !== leader) {
        tryElector();
      } else {
        conn.call('getElectorate', options.group, function (err, res) {
          if (err) {
            electorTries[connectedTo]++;
            tryElector();
          } else if (res.leader !== leader) {
            // update the electorate, and then definitely try to connect to the leader.
            updateElectorate(res);
            tryElector(res.leader);
          } else {
            if (! connectedToLeadershipGroup.isResolved()) {
              connectedToLeadershipGroup["return"]();
            }
            //console.log("updating electorate with", res);
            updateElectorate(res);
          }
        });
      }
    };

    var monitorConnection = function () {
      return Meteor.setInterval(checkConnection, MONITOR_INTERVAL);
    };

    intervalHandle = monitorConnection();

    conn.disconnect = function () {
      if (intervalHandle)
        Meteor.clearInterval(intervalHandle);
      intervalHandle = null;
      prevDisconnect.apply(conn);
    };

    conn.reconnect = function () {
      if (!intervalHandle)
        intervalHandle = monitorConnection();
      if (arguments[0] && arguments[0].url) {
        makeElectorTries(arguments[0].url);
        tryElector();
      } else {
        prevReconnect.apply(conn, arguments);
      }
    };

    conn.getUrl = function () {
      return _.keys(electorTries).join(',');
    };

    conn.tries = function () {
      return electorTries;
    };


    // Assumes that `call` is implemented in terms of `apply`. All method calls
    // should be deferred until we are sure we've connected to the right
    // leadership group.
    conn.apply = function (/* arguments */) {
      var args = _.toArray(arguments);
      if (typeof args[args.length-1] === 'function') {
        // this needs to be independent of this fiber if there is a callback.
        Meteor.defer(function () {
          connectedToLeadershipGroup.wait();
          return prevApply.apply(conn, args);
        });
        return null; // if there is a callback, the return value is not used
      } else {
        connectedToLeadershipGroup.wait();
        return prevApply.apply(conn, args);
      }
    };

    conn.onLost = function (callback) {
      lostCallbacks.push(callback);
    };

    conn.onFound = function (callback) {
      foundCallbacks.push(callback);
    };

    return conn;
  }

};
