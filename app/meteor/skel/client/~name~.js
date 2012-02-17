Template.button_demo.events = {
  'click input': function () {
    Clicks.insert({time: (new Date()).getTime()});
  }
};

Template.button_demo.ever_pressed = function (options) {
  return Clicks.find().count() > 0;
};

Template.button_demo.press_count = function () {
  return Clicks.find().count();
};
