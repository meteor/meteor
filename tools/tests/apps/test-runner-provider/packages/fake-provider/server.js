import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

if (Meteor.isTest) {
  WebApp.connectHandlers.use(
    '/__meteor__/fake-test-runner/complete',
    (_request, response) => {
      console.log('[fake-provider-runtime] complete');
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('ok');
      setTimeout(() => process.exit(0), 25);
    }
  );
}
