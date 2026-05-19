import { Meteor } from 'meteor/meteor';
import { createServerMessage } from '@example/shared';
import { describeServerPackage } from '@example/server';

console.log(createServerMessage('workspace package loaded on the server'));
console.log(describeServerPackage());

Meteor.startup(() => {
  Meteor.methods({
    'pnpmMonorepo.packageStatus'() {
      return {
        domain: createServerMessage('method'),
        server: describeServerPackage(),
      };
    },
  });
});
