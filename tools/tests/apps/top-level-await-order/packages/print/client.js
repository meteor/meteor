// Wait for Meteor package to load
let logs = [];
let oldLog = console.log;
console.log = function (message) {
  logs.push(message);
  oldLog.apply(this, arguments);
}

Meteor.startup(() => {
  // run after all startup hooks
  setTimeout(() => {
    Meteor.call('print', logs);
  });
});
