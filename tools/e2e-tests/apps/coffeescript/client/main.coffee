import React from 'react'
import { createRoot } from 'react-dom/client'
import { Meteor } from 'meteor/meteor'
import { App } from '/imports/ui/App.coffee'

Meteor.startup ->
  container = document.getElementById('react-target')
  root = createRoot(container)
  root.render(<App />)
