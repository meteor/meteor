// A second DDP endpoint replaces the public reverse.meteor.com dependency.
// Keep its methods distinct so failing to switch URLs cannot pass the test.
const reconnectTestServers = new Map();

Meteor.methods({
  async startReconnectTestServer() {
    const httpServer = Npm.require('node:http').createServer();
    const originalHttpServer = WebApp.httpServer;
    const originalPackages = Meteor.settings.packages;
    const originalTransport = __meteor_runtime_config__.DDP_TRANSPORT;
    let ddpServer;
    try {
      // Server construction attaches its transport synchronously. Restore the
      // app's globals before yielding. Like the old public endpoint, this
      // fixture uses SockJS, which also accepts native WebSocket clients.
      WebApp.httpServer = httpServer;
      Meteor.settings.packages = {
        ...originalPackages,
        'ddp-server': { transport: 'sockjs' }
      };
      ddpServer = new Meteor.server.constructor({ disconnectGracePeriod: 0 });
    } finally {
      WebApp.httpServer = originalHttpServer;
      Meteor.settings.packages = originalPackages;
      __meteor_runtime_config__.DDP_TRANSPORT = originalTransport;
    }
    ddpServer.methods({
      reverse(arg) {
        return arg.split('').reverse().join('');
      }
    });
    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const id = Random.id();
    reconnectTestServers.set(id, { httpServer, ddpServer });
    const url = new URL(Meteor.absoluteUrl());
    url.protocol = 'http:';
    url.hostname = '127.0.0.1';
    url.port = httpServer.address().port;
    return { id, url: url.href };
  },

  async stopReconnectTestServer(id) {
    const { httpServer, ddpServer } = reconnectTestServers.get(id);
    reconnectTestServers.delete(id);
    for (const session of ddpServer.sessions.values()) session.close();
    for (const socket of ddpServer.stream_server.all_sockets()) socket.close();
    await new Promise((resolve, reject) => {
      httpServer.close(error => (error ? reject(error) : resolve()));
    });
  }
});
