export { DDP } from '../common/namespace.js';

if (false) {
  // This is used inside livedata_connection, but this is what gets
  // it included in the client bundle
  import './stream_client_sockjs';
}

import '../common/livedata_connection';

// Initialize the default server connection and put it on Meteor.connection
import './client_convenience';
