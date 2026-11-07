// Methods related to links. Loaded on both sides: the client runs the stub at
// once, the server runs the real thing when the call gets through.

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Links } from './links.js';

Meteor.methods({
  // The id comes from the client and the insert is skipped when the document
  // is already there, so the call can safely run twice: Meteor re-sends a call
  // it got no answer for, and the `offline` package replays it after a reload.
  async 'links.insert'({ _id, title, url }) {
    check(_id, String);
    check(title, String);
    check(url, String);

    await Links.upsertAsync({ _id }, { $setOnInsert: { title, url, createdAt: new Date() } });
  },
});
