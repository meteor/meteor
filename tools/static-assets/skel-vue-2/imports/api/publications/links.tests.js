import { assert } from 'chai'
import { PublicationCollector } from 'meteor/johanbrook:publication-collector'
import Links from '../collections/Links.js'
import './publications.js'

describe('Publish links', function () {
  beforeEach(function () {
    Links.remove({})
    Links.insert({
      title: 'meteor homepage',
      url: 'https://www.meteor.com'
    })
  })

  it('sends all links', function (done) {
    const collector = new PublicationCollector()
    collector.collect('links', (collections) => {
      assert.equal(collections.links.length, 1)
      done()
    })
  })
})
