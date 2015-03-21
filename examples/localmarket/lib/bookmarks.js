BookmarkCounts = new Mongo.Collection('bookmarkCounts');

Meteor.methods({
  'bookmarkRecipe': function(recipeName) {
    check(this.userId, String);
    check(recipeName, String);

    var affected = Meteor.users.update({
      _id: this.userId,
      bookmarkedRecipeNames: {$ne: recipeName}
    }, {
      $addToSet: {bookmarkedRecipeNames: recipeName}
    });

    if (affected)
      BookmarkCounts.update({recipeName: recipeName}, {$inc: {count: 1}});
  },

  'unbookmarkRecipe': function(recipeName) {
    check(this.userId, String);
    check(recipeName, String);

    var affected = Meteor.users.update({
      _id: this.userId,
      bookmarkedRecipeNames: recipeName
    }, {
      $pull: {bookmarkedRecipeNames: recipeName}
    });

    if (affected)
      BookmarkCounts.update({recipeName: recipeName}, {$inc: {count: -1}});
  }
});

// Initialize bookmark counts. We could use upsert instead.
if (Meteor.isServer && BookmarkCounts.find().count() === 0) {
  Meteor.startup(function() {
    _.each(RecipesData, function(recipe, recipeName) {
      BookmarkCounts.insert({recipeName: recipeName, count: 0});
    });
  });
}