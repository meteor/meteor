import { once } from 'node:events';
import { createServer } from 'node:http';
import { RoutePolicy } from 'meteor/routepolicy';
import { WebApp } from 'meteor/webapp';

const fixtures = new Map();

function configureDDPServer(httpServer) {
  const mainHttpServer = WebApp.httpServer;
  const settings = Meteor.settings;
  const routes = RoutePolicy.urlPrefixTypes;
  const transport = __meteor_runtime_config__.DDP_TRANSPORT;

  // The DDP constructor installs its handlers on WebApp.httpServer. Give it
  // the fixture listener only during synchronous construction.
  try {
    WebApp.httpServer = httpServer;
    RoutePolicy.urlPrefixTypes = { ...routes };
    if (transport && transport !== 'sockjs') {
      // SockJS also serves raw WebSocket clients at /websocket. The fixture
      // can use both client transports with a single ephemeral port.
      Meteor.settings = {
        ...settings,
        packages: {
          ...settings.packages,
          'ddp-server': { transport: 'sockjs' }
        }
      };
    }
    const server = new Meteor.server.constructor({ disconnectGracePeriod: 0 });
    server.methods({
      reverse(arg) {
        check(arg, String);
        return arg.split('').reverse().join('');
      }
    });
  } finally {
    WebApp.httpServer = mainHttpServer;
    Meteor.settings = settings;
    RoutePolicy.urlPrefixTypes = routes;
    if (transport) __meteor_runtime_config__.DDP_TRANSPORT = transport;
  }
}

async function stopFixture(id) {
  const starting = fixtures.get(id);
  if (!starting) return;

  const fixture = await starting.catch(() => null);
  if (fixtures.get(id) !== starting) return;
  fixtures.delete(id);
  if (!fixture) return;

  clearTimeout(fixture.timer);
  await new Promise((resolve, reject) => {
    fixture.httpServer.close(error => error ? reject(error) : resolve());
    for (const socket of fixture.sockets) socket.destroy();
  });
}

async function startFixture(id) {
  const httpServer = createServer();
  const sockets = new Set();
  httpServer.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  configureDDPServer(httpServer);
  const listening = once(httpServer, 'listening');
  httpServer.listen(0, '127.0.0.1');
  await listening;

  // Also clean up if the test client disappears before it can call stop.
  const timer = setTimeout(() => stopFixture(id).catch(Meteor._debug), 60_000);
  const pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';
  const url = `http://127.0.0.1:${httpServer.address().port}${pathPrefix}`;
  return { url, httpServer, sockets, timer };
}

Meteor.methods({
  async 'ddp-client/reconnect/start'(id) {
    check(id, String);
    // DDP can replay the method if the control connection reconnects.
    const starting = fixtures.get(id) ?? startFixture(id);
    fixtures.set(id, starting);
    try {
      return (await starting).url;
    } catch (error) {
      if (fixtures.get(id) === starting) fixtures.delete(id);
      throw error;
    }
  },

  async 'ddp-client/reconnect/stop'(id) {
    check(id, String);
    await stopFixture(id);
  }
});
