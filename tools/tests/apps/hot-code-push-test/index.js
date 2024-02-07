if (Meteor.isClient) {
  if (Meteor.isCordova) {
    Meteor.startup(() => {
      WebAppLocalServer.onError((e) => {
        console.log("hot code push result: " + e.message)
      });
      
      WebAppLocalServer.onNewVersionReady(() => {
        WebAppLocalServer.switchToPendingVersion(() => {
          console.log("hot code push result: " + "app updated to new version");
        });
      });

      WebAppLocalServer.checkForUpdates();
    });
  } 
}
