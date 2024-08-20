console.log('package 1 - b before');
await 0;
console.log('package 1 - b after');
Promise.resolve().then(() => {
  console.log('package 1 - b later');
});
