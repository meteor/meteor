// This app functions with no packages loaded, so it's good for testing releases
// with no packages.  All it does is print "RUNNING" and run forever.
main = function () {
  // Tell the runner we're up.
  console.log("LISTENING");
  // Ensure Node doesn't kill us.
  process.stdin.resume();
  // Ensure boot.js doesn't kill us.
  return 'DAEMON';
};
