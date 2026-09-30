import { Meteor } from 'meteor/meteor';
import { accentColor, createServerMessage } from '@example/shared';
import { describeServerPackage } from '@example/server';

console.log(createServerMessage('workspace package loaded on the server'));
console.log(describeServerPackage());
console.log(`domain:server:accent ${accentColor}`);

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
