// This file was used to convert the old docs table of contents
//   (a slightly modified version of it in old-toc.js)
// to a mapping of redirects hash -> page it lives in.
//
// I ran this script to generate the redirects.js file at scripts/redirects.js
//
// Keeping it in source control just in case we need to redo it for some reason

var _ = require('underscore');
var nameToId = require('../scripts/nameToId.js');
var oldToc = require('./old-toc.js');

var idsToPages = {};

runList = (dir, as) => {
  _.each(as, a => {
    if (!_.isArray(a) && _.isObject(a)){
      a = a.name;
    }

    if (_.isString(a)) {
      currFile = `${dir}/${a.toLowerCase()}.html`;
    } else {
      addIds = (ids) => {
        _.each(ids, (id) => {
          if (_.isArray(id)) {
            addIds(id);
          } else {
            if (_.isObject(id)) {
              if (id.type === 'spacer') {
                return;
              }
              id = id.id || id.name;
            }
            idsToPages[nameToId[id] || id] = currFile;
          }
        });
      }
      addIds(a);
    }
  });
};

runList('api', oldToc[2]);
runList('packages', oldToc[4]);

_.each(oldToc[6][0], id => {
  idsToPages[id.replace(/\s|\-|\//g, '')] = 'commandline.html';
});

console.log(JSON.stringify(idsToPages, null, 2));
