// Wait for Meteor package to load
Meteor.methods({
  print(logs) {
    logs.forEach(message => {
      console.log('[client]', message);
    });
  }
});
