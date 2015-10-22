"use strict"

Template.noteOfTheDay.helpers({
  note: function () {
    return "Greetings " + App.displayName() + "!"
  }
})
