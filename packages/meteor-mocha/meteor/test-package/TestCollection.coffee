@practical ?= {}

practical.TestCollection = new Mongo.Collection('test.collection')

#if Meteor.isClient
#  throw new Error 'Uncaught client side error before tests.'
