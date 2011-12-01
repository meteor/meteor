Sky.subscribe('clicks');

Template.button_demo.events = {
  'click input': function () {
    Clicks.insert({});
  }
};

Template.button_demo.ever_pressed = function (options) {
  return Clicks.find().length > 0;
};

Template.button_demo.press_count = function () {
  return Clicks.find().length;
};
