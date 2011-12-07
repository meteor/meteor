Package.describe({
  summary: "Skybreak's latency-compensated distributed data framework",
  internal: true
});

Package.require('underscore');

Package.require('session');
Package.require('minimongo');
Package.client_file('livedata_client.js');

// XXX hack. this is really terrible :)
//
// (1) for a package like underscore, we arguably need a way to
// distinguish between including/requiring it on the server, and
// requiring it on the client
//
// (2) it's really unfortunate that if you depend on package A, and A
// depends on B, then B's symbols end up in your global namespace. in
// this case A is livedata, B is underscore, and "you" is all skybreak
// programs. sigh.. we probably need a way to make it so that when you
// require a package, its symbols show up in your namespace, but
// nobody else's? can this be accomplished without confusing the fuck
// out of everyone?
Package.server_file('../../app/lib/third/underscore.js');

Package.server_file('uuid.js');
Package.server_file('livedata_server.js');
Package.server_file('mongo_driver.js');
