Meteor.startup(() => {
  console.log('plugin - startup');
});
console.log('plugin - before');
await 0
console.log('plugin - after');
Promise.resolve().then(() => console.log('plugin - later'));
