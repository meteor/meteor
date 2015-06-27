Template.admin.helpers({
  isAdmin: function() {
    return Meteor.user() && Meteor.user().admin;
  },
  
  latestNews: function() {
    return News.latest();
  }
});

Template.admin.events({
  'submit form': function(event) {
    event.preventDefault();

    var text = $(event.target).find('[name=text]').val();
    News.insert({ text: text, date: new Date });

    alert('Saved latest news');
  },
  
  'click .login': function() {
    Meteor.loginWithTwitter();
  }
})