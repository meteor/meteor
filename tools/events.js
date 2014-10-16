/// A simple interface for global events, avoiding tight coupling.

var _ = require('underscore');

var EventEmitter = require('events').EventEmitter;

var events = exports;

events.Events = new EventEmitter();
