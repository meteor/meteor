import { Meteor } from "meteor/meteor";
import { WebApp } from 'meteor/webapp';
import express from 'express';
import bodyParser from 'body-parser';
import { pwaJson } from "./pwa-json";
import { appleAppSiteAssociation } from "./apple-app-site-association";

Meteor.startup(() => {
  const app = express();
  app.use(bodyParser.json());
  app.get('/pwa.json', Meteor.bindEnvironment(pwaJson));
  app.get(
    '/apple-app-site-association',
    Meteor.bindEnvironment(appleAppSiteAssociation)
  );

  WebApp.connectHandlers.use(app);
});
