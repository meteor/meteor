if (Meteor.isServer) {
  // Printing out my own source code!
  (async () => {
    console.log(await Assets.getTextAsync("asset-and-source.js"));
  })();
}
