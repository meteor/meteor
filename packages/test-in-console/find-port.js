const net = require("node:net");

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function findPort(preferredPort = 0) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const http = net.createServer();
    const mongo = net.createServer();
    try {
      const port = await listen(http, attempt === 0 ? preferredPort : 0);
      if (port === 65535) continue;
      // Keep the HTTP port bound while checking Meteor's adjacent Mongo port.
      await listen(mongo, port + 1);
      return port;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    } finally {
      await Promise.all([close(http), close(mongo)]);
    }
  }
  throw new Error("Could not find available HTTP and Mongo test ports");
}

module.exports = findPort;

if (require.main === module) {
  findPort()
    .then((port) => console.log(port))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
