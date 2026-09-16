import { bootstrapApplication } from '@angular/platform-browser';
import { Meteor } from 'meteor/meteor';
import { App } from '/imports/ui/app.component';
import { appConfig } from '/imports/ui/app.config';
import 'zone.js';
import './main.css';

Meteor.startup(() => {
  bootstrapApplication(App, appConfig)
    .catch(err => console.error(err));
});
