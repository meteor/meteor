Meteor.methods({
  report: function (reports) {
    _.each(reports, function (report) {
      Meteor.http.post(report.url, {
        content: report.content
      });
    });
    return null;
  }
});
