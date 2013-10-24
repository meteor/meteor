var fs = Npm.require('fs');
var Future = Npm.require('fibers/future');

var readFile = Meteor._wrapAsync(fs.readFile);

var writeFile = Meteor._wrapAsync(fs.writeFile);

Follower = {

  connect: function (urlSet, options) {
    var electorTries;
    options = _.extend({
      group: "package.leadershipLivedata"
    }, options);
    // start each elector as untried/assumed connectable.

    // for options.priority, low-priority things are tried first.
    var makeElectorTries = function (urlSet, options) {
      if (options.reset || !electorTries)
        electorTries = {};
      if (typeof urlSet === 'string') {
        urlSet = _.map(urlSet.split(','), function (url) {return url.trim();});
      }
      _.each(urlSet, function (url) {
        electorTries[url] = options.priority || 0;
      });
    };
    if (options.file) {
      var contents;
      try {
        contents = readFile(options.file, 'utf8');
      } catch (e) {
        console.log("no file to read electors out of");
      }
      if (contents)
        makeElectorTries(contents, { priority: 0, reset: true });
      makeElectorTries(urlSet, {priority: 1, reset: false});
    } else {
      makeElectorTries(urlSet, { priority: 0, reset: true });
    }
    var tryingUrl = null;
    var conn = null;
    var leader = null;
    var connected = null;
    var intervalHandle = null;

    // Used to defer all method calls until we're sure that we connected to the
    // right leadership group.
    var connectedToLeadershipGroup = new Future();

    var findFewestTries = function () {
      var min = 10000;
      var minElector = null;
      _.each(electorTries, function (tries, elector) {
        if (tries < min) {
          min = tries;
          minElector = elector;
        }
      });
      return minElector;
    };

    var updateElectorate = function (res) {
      leader = res.leader;
      _.each(electorTries, function (state, elector) {
        if (!_.contains(res.electorate, elector)) {
          delete electorTries[elector];
        }
      });
      _.each(res.electorate, function (elector) {
        if (typeof electorTries[elector] === 'undefined') {
          electorTries[elector] = 0; // we haven't heard of this elector yet.
        }
      });
      if (options.file) {
        writeFile(options.file, res.electorate.join(','), 'utf8');
      }
    };

    var tryElector = function (url) {
      url = url || findFewestTries();
      //console.log("trying", url, electorTries, tryingUrl);
      if (conn) {
        conn._reconnectImpl({
          url: url
        });
      } else {
        conn = DDP.connect(url);
        conn._reconnectImpl = conn.reconnect;
      }

      if (tryingUrl) {
        electorTries[tryingUrl]++;
        tryingUrl = url;
      } else {
        tryingUrl = url;
        conn.call('getElectorate', options.group, function (err, res) {
          connected = tryingUrl;
          tryingUrl = null;
          if (err) {
            electorTries[url]++;
            tryElector();
            return;
          }
          if (! connectedToLeadershipGroup.isResolved()) {
            connectedToLeadershipGroup["return"]();
          }
          // we got an answer!  Connected!
          electorTries[url] = 0;
          if (res.leader === url) {
            // we're good.

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
      };
    };

    tryElector();

    var checkConnection = function () {
        if (conn.status().status !== 'connected' || connected !== leader) {
          tryElector();
        } else {
          conn.call('getElectorate', options.group, function (err, res) {
            if (err) {
              electorTries[connected]++;
              tryElector();
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
      return Meteor.setInterval(checkConnection, 5*1000); // every 5 seconds
    };

    intervalHandle = monitorConnection();


    var prevDisconnect = conn.disconnect;
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
        makeElectorTries(arguments[0].url, {reset: true, priority: 0});
        tryElector();
      } else {
        conn._reconnectImpl.apply(conn, arguments);
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
    conn._applyImpl = conn.apply;
    conn.apply = function (/* arguments */) {
      connectedToLeadershipGroup.wait();
      return conn._applyImpl.apply(conn, arguments);
    };

    return conn;

  }
};
