import React from 'react'
import { useFind, useSubscribe } from 'meteor/react-meteor-data'
import { LinksCollection } from '../api/links.coffee'

export Info = ->
  isLoading = useSubscribe('links')
  links = useFind(-> LinksCollection.find())

  if isLoading()
    return <div>Loading...</div>

  <div>
    <h2>Learn Meteor!</h2>
    <ul>{links.map (link) ->
      <li key={link._id}>
        <a href={link.url} target="_blank">{link.title}</a>
      </li>
    }</ul>
  </div>
