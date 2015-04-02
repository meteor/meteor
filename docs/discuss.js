Comments = new Mongo.Collection("comments");

Comments.matchPattern = {
  _id: String,

  // passed in when the discussion page is opened
  topicId: String,

  // user who posted this comment
  userId: String,
  username: String,

  // content, as markdown code
  markdownContent: String,

  createdAt: Date,
  updatedAt: Date,

  release: release
};

if (Meteor.isServer) {
  Meteor.publish("comments", function (topicId) {
    return Comments.find({topicId: topicId});
  });
}

Comments.addComment = function (newComment) {
  var newId = Random.id();

  newComment._id = newId;

  Meteor.call("_addComment", newComment);
};

Comments.deleteComment = function (commentId) {
  Meteor.call("_deleteComment", commentId);
};

Meteor.methods({
  _addComment: function (newComment) {
    check(newComment, Comments.matchPattern);

    if (this.userId !== newComment.userId) {
      throw new Meteor.Error("userid-must-match");
    }

    if (Meteor.users.findOne(this.userId).profile.name !== newComment.username) {
      throw new Meteor.Error("inconsistent-username");
    }

    Comments.insert(newComment);

    CommentCounts.upsert({
      topicId: newComment.topicId
    }, {
      $inc: {
        count: 1
      }
    });
  },
  _deleteComment: function (commentId) {
    var comment = Comments.findOne(commentId);

    if (comment.userId !== this.userId) {
      throw new Meteor.Error("userid-must-match");
    }

    Comments.remove(commentId);
  }
});

Meteor.users.deny({update: function () { return true; }});


CommentCounts = new Mongo.Collection("comment-counts");

CommentCounts.matchPattern = {
  topicId: String,
  count: Number
};

if (Meteor.isServer) {
  Meteor.publish("comment-counts", function () {
    return CommentCounts.find();
  });
} else {
  Meteor.subscribe("comment-counts");
}
