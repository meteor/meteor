let url = null;

if (Meteor.settings?.public?.runId &&
    Meteor.settings?.public?.reportTo) {
  url = Meteor.settings.public.reportTo +
      "/report/" +
      Meteor.settings.public.runId;
}

Meteor.methods({
  report: async function (reports) {
    // XXX Could do a more precise validation here; reports are complex!
    check(reports, [Object]);
    if (url) {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reports),
       });
    }
    return null;
  }
});

// provide some notification we're started. This is to allow use
// in automated scripts with `meteor run --once` which does not
// print when the proxy is listening.
Meteor.startup(function () {
  Meteor._debug("test-in-console listening");
});
