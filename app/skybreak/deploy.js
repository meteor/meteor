var tty = require('tty');
var request = require('request');


exports.HOSTNAME = 'deploy.skybreakplatform.com';


// accepts www.host.com, defaults domain to skybreakplatform, defaults
// protocol to http.
//
// XXX shared w/ proxy.js
exports.parse_url = function (url) {
  if (!url.match(':\/\/'))
    url = 'http://' + url;

  var parsed = require('url').parse(url);

  delete parsed.host; // we use hostname

  if (parsed.hostname && !parsed.hostname.match(/\./))
    parsed.hostname += '.skybreakplatform.com';

  return parsed;
};


// Check if a particular endpoint requires a password. If so, prompt for
// it.
//
// takes an endpoint name and callback function(password). This is
// always called exactly once. If no password is needed, password will
// be undefined.
exports.maybe_password = function (endpoint, callback) {
  var check_url = "http://" + exports.HOSTNAME + "/has_password/" + endpoint;
  // var check_url = "http://localhost:8001/has_password/" + endpoint;


  request(check_url, function (error, response, body) {
    if (error || response.statusCode !== 200) {
      // XXX more fine grained error handling
      callback();
      return;
    }

    // XXX in theory we should JSON parse the result, and use that. But
    // we happen to know we'll only ever get 'true' or 'false' if we got
    // a 200, so don't bother.

    if (body === "false") {
      callback();
      return;
    }

    // Password prompt code adapted from
    // https://github.com/visionmedia/commander.js/blob/master/lib/commander.js

    var buf = '';
    process.stdin.resume();
    tty.setRawMode(true);
    process.stdout.write("Password: ");

    // keypress
    process.stdin.on('keypress', function(c, key){
      if (key && 'enter' === key.name) {
        console.log();
        process.stdin.removeAllListeners('keypress');
        tty.setRawMode(false);

        // if they just hit enter, prompt again. let's not do this.
        //if (!buf.trim().length) return self.password(str, mask, fn);

        // XXX md5 hash the password!

        callback(buf);
        return;
      }

      // deal with backspace
      if (key && 'backspace' === key.name) {
        buf = buf.substring(0, buf.length - 1);
        return;
      }

      // raw mode masks control-c. make sure users can get out.
      if (key && key.ctrl && 'c' === key.name) {
        console.log();
        process.stdin.removeAllListeners('keypress');
        tty.setRawMode(false);

        process.kill(process.pid, 'SIGINT');
        return;
      }

      buf += c;
    });
  });
};

