import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { createAuthMiddleware } from 'meteor/accounts-express';

function jsonHandler(handler) {
  return async function (req, res) {
    try {
      const body = await handler(req);
      res.setHeader('Content-Type', 'application/json');
      res.status(body && body.__status ? body.__status : 200);
      if (body && body.__status) delete body.__status;
      res.end(JSON.stringify(body));
    } catch (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  };
}

WebApp.handlers.get(
  '/api/me',
  createAuthMiddleware({ required: true }),
  jsonHandler(async (req) => {
    return { userId: req.userId, meteorUserId: Meteor.userId() };
  }),
);

WebApp.handlers.get(
  '/api/me-optional',
  createAuthMiddleware({ required: false }),
  jsonHandler(async (req) => {
    return { userId: req.userId || null, meteorUserId: Meteor.userId() || null };
  }),
);

// Meteor.userId() inside a WebApp endpoint resolves via the async-local
// context that createAuthMiddleware sets through _CurrentEndpointInvocation.
WebApp.handlers.get(
  '/api/whoami-method',
  createAuthMiddleware({ required: true }),
  jsonHandler(async (req) => {
    return { userId: Meteor.userId(), reqUserId: req.userId };
  }),
);
