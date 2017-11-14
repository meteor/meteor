import { Meteor } from 'meteor/meteor';

// In the client and server entry points, we make sure the
// bundler loads the correct thing. Here, we just need to
// make sure that we require the right one.
export default function getClientStreamClass() {
  // The static analyzer of the bundler specifically looks
  // for static calls to 'require', so it won't treat the
  // below calls as a request to include that module.
  //
  // That means stream_client_nodejs won't be included on
  // the client, as desired.
  const modulePath = Meteor.isClient
    ? '../client/stream_client_sockjs'
    : '../server/stream_client_nodejs';

  return require(modulePath).default;
}
