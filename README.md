# Meteor Synced Cron

A simple cron system for [Meteor](http://meteor.com). It supports syncronizing jobs between multiple processes.

## Installation

SyncedCron can be installed with [Meteorite](https://github.com/oortcloud/meteorite/). From inside a Meteorite-managed app:

``` sh
$ mrt add synced-cron
```

## API

### Basics

To write a cron job, give it a unique name, a schedule an a function to run like below. SyncedCron uses the fantastic [later.js](http://bunkat.github.io/later/) library behind the scenes. A Later.js `parse` object is passed into the schedule call that gives you a huge amount of flexibility for scheduling your jobs, see the [documentation](http://bunkat.github.io/later/parsers.html#overview). 

``` javascript
SyncedCron.add({
  name: 'Crunch some important numbers for the marketing department',
  schedule: function(parser) {
    // parser is a later.parse object
    return parser.text('every 2 hourss');
  }, 
  job: function() {
    var numbersCrunched = CrushSomeNumbers();
    return numbersCrunched;
  }
});
```

To start processing your jobs, somewhere in your project add:

``` javascript
Meteor.startup(function() {
  SyncedCron.start();
});
```

### Advanced

SyncedCron uses a collection called `cronHistory` to syncronize between processes. This also serves as a useful log of when jobs ran along with their output or error. A sample item looks like:

```
{ _id: 'wdYLPBZp5zzbwdfYj',
  intendedAt: Sun Apr 13 2014 17:34:00 GMT-0700 (MST),
  finishedAt: Sun Apr 13 2014 17:34:01 GMT-0700 (MST),
  name: 'Crunch some important numbers for the marketing department',
  startedAt: Sun Apr 13 2014 17:34:00 GMT-0700 (MST),
  result: '1982 numbers crunched'
}
```



## Contributing

Write some code. Write some tests. To run the tests, do:

``` sh
$ mrt test-packages synced-cron
```

## License 

MIT. (c) Percolate Studio

Synced Cron was developed as part of the [Verso](http://versoapp.com) project.
