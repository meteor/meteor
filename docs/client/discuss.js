var openDiscussion = function (id, name) {
  Session.set("openDiscussion", {
    id: id,
    name: name
  });

  openDrawerWithTemplate("discussContent");
};

var closeDiscussion = function () {
  Session.set("openDiscussion", null);
  closeDrawer();
};

var numCommentsForId = function (id) {
  var countDoc = CommentCounts.findOne({topicId: id})
  if (countDoc) {
    return countDoc.count;
  }

  return 0;
}

Template.discuss.helpers({
  numComments: numCommentsForId
});

Template.discuss.events({
  "click .discuss-button": function () {
    openDiscussion(this.id, this.name);
  }
});

// Close search with ESC
$(document).on("keydown", function (event) {
  if (event.which === 27) {
    closeDiscussion();
  }
});

Template.discussContent.onCreated(function () {
  var self = this;

  self.preview = new ReactiveVar("");

  self.autorun(function () {
    var openDiscussion = Session.get("openDiscussion");
    if (openDiscussion && openDiscussion.id) {
      self.subscribe("comments", openDiscussion.id);
    }
  })
});

Template.discussContent.onRendered(function () {
  this.$("textarea").autosize();
});

Template.discussContent.helpers({
  openDiscussion: function () {
    return Session.get("openDiscussion");
  },
  comments: function () {
    return Comments.find({topicId: Session.get("openDiscussion").id});
  },
  preview: function () {
    return Template.instance().preview.get();
  },
  numComments: numCommentsForId
});

Template.discussContent.events({
  "click .close": function () {
    closeDiscussion();

    return false;
  },
  "keyup textarea, change textarea": function (event) {
    Template.instance().preview.set(event.target.value);
  },
  "submit .new-comment": function (event) {
    event.preventDefault();

    var markdownContent = event.target.markdownContent.value;

    Comments.addComment({
      markdownContent: markdownContent,
      topicId: this.id,
      userId: Meteor.userId(),
      username: Meteor.user().profile.name,
      createdAt: new Date(),
      updatedAt: new Date(),
      release: release // comes from helpers.js
    });

    event.target.markdownContent.value = "";

    Template.instance().preview.set("");
  },
  "click .delete-comment": function (event) {
    event.preventDefault();
    console.log(this);

    if (confirm("Delete this comment?")) {
      Comments.deleteComment(this._id);
    }
  }
});

Template.comment.helpers({
  formatDate: function (date) {
    if (! date) { return "" }

    var local = new Date(date);
    local.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return local.toJSON().slice(0, 10);
  }
});
