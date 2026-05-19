import { Meteor } from 'meteor/meteor';
import { createServerMessage } from '@e2e/domain';
import { describeServerPackage } from '@e2e/server-tools/server';

console.log(createServerMessage('server package loaded'));
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
