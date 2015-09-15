// A collection that is synchronized across client and server with the
// 'autopublish' package. To control where the data is accessible from, remove
// 'autopublish' and use Meteor.publish and Meteor.subscribe
Items = new Mongo.Collection("items");

if (Meteor.isClient) {
  // Code here runs on the client only
  angular
    .module('skelApp',[
      'angular-meteor'
    ])
    .controller('ItemsListCtrl', ItemsListCtrl);

  function ItemsListCtrl ($scope) {

    this.items = $scope.$meteorCollection(Items);

    this.addItem = function () {
      const nextIndex = Items.find().count() + 1;

      // We can insert from the client because we have the 'insecure' package
      // installed. Remove it and use Meteor methods for better security
      Items.insert({
        text: "Hello world! " + nextIndex
      });
    }
  }
  ItemsListCtrl.$inject = ['$scope'];
}

if (Meteor.isServer) {
  // Code inside here will run on the server only
}