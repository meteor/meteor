import { Meteor } from 'meteor/meteor';

// In the client and server entry points, we make sure the
// bundler loads the correct thing. Here, we just need to
// make sure that we require the right one.
export default function getClientStreamClass() {
  // The static analyzer of the bundler specifically looks
  // for direct calls to 'require', so it won't treat the
  // below calls as a request to include that module.
  const notRequire = require;

  if (Meteor.isClient) {
    return notRequire('../client/stream_client_sockjs').default;
  } else {
    /* Meteor.isServer */
    return notRequire('../server/stream_client_nodejs').default;
  }
}
