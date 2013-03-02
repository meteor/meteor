Meteor.methods({
  report: function (url, reports) {
    Meteor.http.post(url, {
      data: reports
    });
    return null;
  }
});
