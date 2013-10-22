Meteor.subscribe('rooms');

Session.set('current_room', null);
Session.set('editing_room_name', false);

Deps.autorun(function () {
  var room_id = Session.get('current_room');
  if (room_id) Meteor.subscribe('room-detail', room_id);
});

// XXX would be nice to eliminate this function and have people just
// call Session.set("current_room", foo) directly instead
var selectRoom = function (room_id) {
  // XXX pushstate
  var room = Rooms.find(room_id);
  Session.set('current_room', room_id);
};

Meteor.startup(function () {
  $('body').layout({applyDefaultStyles: true})
});

Template.room_list.rooms = function () {
  // XXX it would be nice if this were find instead of findLive (ie,
  // if they were unified in some sane way)
  return Rooms.findLive({}, {sort: {name: 1}});
};

Template.add_room.events = {
  'click': function () {
    // XXX should put up dialog to get name
    // XXX should support automatically set created/updated timestamps
    var room_id = Rooms.insert({name: "New room",
                                // XXX horrid syntax
                                created: (new Date()).getTime()});
    selectRoom(room_id);
    // XXX XXX XXX this fails to work -- it leaves edit mode after
    // 1RTT. what happens is, the server echos the insert back to us,
    // and that is currently wired up to trigger a changed event on
    // the findlive, which redraws the element, which triggers blur,
    // which causes us to set editing_room_name to false.
    //
    // one option is to have the rendering function (maybe in a
    // post-render routine?) decide if it currently wants
    // focus. (should that be within the recomputation envelope, I
    // wonder?)
    //
    // another is to suppress blur on rerender. probably the only
    // principled way to do this is to narrow the scope of the
    // rerender to not include the <input>.
    //
    // [No idea if the comment above is still current]
    Session.set('editing_room_name', true);
    Deps.flush();
    $('#room_name_input').focus();
  }
};

Template.room.events = {
  'mousedown': function (evt) {
    selectRoom(this._id);
  },
  'dblclick': function (evt) {
    Session.set('editing_room_name', true);
    // XXX XXX doesn't generalize.. the element might very reasonably
    // not have a unique id. may need a different strategy..
    Deps.flush();
    $('#room_name_input').focus();
  },
  'blur input': function (evt) {
    Session.set('editing_room_name', false);
  },
  'keypress input': function (evt) {
    // XXX should really have a binding/validator-based pattern
    // XXX check to see this pattern works if you are saving
    // continuously (on every keystroke)
    var value = $(evt.target).val();
    if (evt.which === 13 && value.length)
      Rooms.update(this._id, {$set: {name: value}});
    if (evt.which === 13 || evt.which === 27)
      Session.set('editing_room_name', false);
  },
  // If you make this event be click (rather than mousedown), then
  // delete doesn't work if the room isn't already selected. what
  // happens is, the mousedown triggers the selection, which redraws
  // the room, meaning that the elements are replaced out from under
  // the event, and the click event is lost.. bleh. needs
  // reconsideration.
  'mousedown .delete': function (evt) {
    Rooms.remove('rooms', this._id);
    Session.set('current_room', null);
  },
};

Template.room.editing = function (options) {
  // Check current_room first, before editing_room_name, to minimize
  // number of redraws
  return (Session.equals('current_room', this._id) &&
          Session.equals('editing_room_name', true));
};

Template.room.maybe_selected = function () {
  return Session.equals('current_room', this._id) ? "selected" : "";
};

Template.center_pane.messages = function () {
  return Chat.findLive({room: Session.get("current_room")},
                       {sort: {created: 1}});
};

Template.center_pane.any_room_selected = function () {
  return !Session.equals('current_room', null);
};

Template.center_pane.events = {
  'keydown #chat-entry': function (evt) {
    if (evt.which === 13) {
      var room_id = Session.get('current_room');
      if (!room_id)
        return;

      Chat.insert({room: room_id, message: $(evt.target).val(),
                   username: "someone",
                   created: (new Date()).getTime()});
      $(evt.target).val('');
    }
  }
};
