console.log('package 1 - a before');
await 0;
console.log('package 1 - a after');
Promise.resolve().then(() => {
  console.log('package 1 - a later');
});
