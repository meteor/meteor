Follower = {

  connect: function (urlSet) {
    if (typeof urlSet === 'string') {
      urlSet = _.map(urlSet.split(','), function (url) {return url.trim();});
    }
    var electorTries = {};
    // start each elector as untried/assumed connectable.
    _.each(urlSet, function (url) {
      electorTries[url] = 0;
    });
    var tryingUrl = null;
    var conn = null;
    var leader = null;
    var connected = null;
    var intervalHandle = null;

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
    };

    var tryElector = function (url) {
      url = url || findFewestTries();
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
      } else {
        tryingUrl = url;
        conn.call('getElectorate', function (err, res) {
          connected = tryingUrl;
          tryingUrl = null;
          if (err) {
            electorTries[url]++;
            return;
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


    var monitorConnection = function () {
      return Meteor.setInterval(function () {
        if (conn.status().status !== 'connected' || connected !== leader) {
          tryElector();
        } else {
          conn.call('getElectorate', function (err, res) {
            if (err) {
              electorTries[connected]++;
              tryElector();
            } else {
              updateElectorate(res);
            }
          });
        }
      }, 5*1000); // every 5 seconds
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
      conn._reconnectImpl.apply(conn, arguments);
    };

    return conn;

  }
};
