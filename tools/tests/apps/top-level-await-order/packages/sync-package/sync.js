console.log('package sync');
Promise.resolve().then(() => {
  console.log('package sync - later');
});
