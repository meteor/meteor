var logNum = 0;

Meteor.methods({
  log: function (msg) {
    console.log(msg + " " + logNum);
    logNum++;
  }
});