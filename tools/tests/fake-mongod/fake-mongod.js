var net = require('net');

// In the process table, make the process name look like 'fake-mongod'
// rather than 'node fake-mongod.js', so that when the tool greps the
// process table for mongod it will find us.

process.title = ["fake-mongod"].concat(process.argv.slice(2)).join(' ');

// We listen on METEOR_TEST_FAKE_MONGOD_CONTROL_PORT for
// commands. Commands can tell us to print a string to stdout or
// stderr, or to exit.
var port = parseInt(process.env.METEOR_TEST_FAKE_MONGOD_CONTROL_PORT);
if (! port)
  throw new Error("must set METEOR_TEST_FAKE_MONGOD_CONTROL_PORT");

var server = net.createServer(function (c) {
  c.setEncoding('utf8');

  var buf = "";
  c.on('data', function (data) {
    buf += data;

    while (true) {
      var i = buf.indexOf("\n");
      if (i === -1)
        break;
      var command = JSON.parse(buf.substr(0, i));
      buf = buf.substr(i + 1);
      if (command.stdout)
        process.stdout.write(command.stdout);
      if (command.stderr)
        process.stderr.write(command.stderr);
      if (command.exit) {
        process.exit(parseInt(command.exit));
      }
    }
  });
});

server.listen(port, function () {
  // (called when we're successfully listening)
});
