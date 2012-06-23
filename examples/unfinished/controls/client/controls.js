var SPEW = function(str) {
  SPEW.lines.push(str);
  // use counter to signal invalidation
  Session.set("SPEW_V", (Session.get("SPEW_V") || 0)+1);
};
SPEW.lines = [];

Template.radios.events = {
  'change input': function(event) {
    //SPEW("change "+event.target.value);
    if (event.target.checked) {
      Session.set("current_band", event.target.value);
    }
  }
};

Template.radios.current_band = function() {
  return Session.get("current_band");
};

Template.radios.band_checked = function(b) {
  return Session.equals("current_band", b) ?
    'checked="checked"' : '';
};

Template.checkboxes.events = {
  'change input': function(event) {
    Session.set("dst", event.target.checked);
  }
};

Template.checkboxes.dst_checked = function() {
  return Session.get("dst") ? 'checked="checked"' : '';
};

Template.checkboxes.dst = function() {
  return Session.get("dst") ? 'Yes' : 'No';
};

Template.spew.lines = function() {
  Session.get("SPEW_V");
  return SPEW.lines;
};
