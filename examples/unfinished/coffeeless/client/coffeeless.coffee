Meteor.subscribe 'presses'

Template.button_demo.events =
  'click input': ->
     console.log "press"
     Presses.insert {}

Template.button_demo.press_count = -> Presses.find({}).length
