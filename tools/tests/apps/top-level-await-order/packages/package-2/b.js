console.log('package 2 - b');
Promise.resolve().then(() => {
  console.log('package 2 - b later');
});
