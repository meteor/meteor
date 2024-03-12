if (Meteor.isServer) {
  // Printing out my own source code!
  (async () => {
    console.log(await Assets.getText("asset-and-source.js"));
  })();
}
