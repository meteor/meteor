// This file was used to convert the old docs table of contents
//   (a slightly modified version of it in old-toc.js)
// to a mapping of redirects hash -> page it lives in.
//
// I ran this script to generate the redirects.js file at scripts/redirects.js
//
// Keeping it in source control just in case we need to redo it for some reason

var _ = require('underscore');
var nameToId = require('../scripts/nameToId.js');
var idToName = {};
_.each(nameToId, function(id, name) {
  idToName[id] = name;
});
var oldToc = require('./old-toc.js');

// these point to X.html
var idsToPagesWithNoHash = {};
// these point to X.html#name where name is generated from id below
var idsToPages = {};

runList = (dir, as) => {
  _.each(as, a => {
    var aId;
    if (!Array.isArray(a) && _.isObject(a)){
      aId = a.id;
      a = a.name;
    }

    if (_.isString(a)) {
      var name = a.toLowerCase();
      currFile = `${dir}/${name}.html`;
      idsToPagesWithNoHash[name] = currFile;
      if (aId) {
        idsToPagesWithNoHash[aId] = currFile;
      }
    } else {
      addIds = (ids) => {
        _.each(ids, (id) => {
          if (Array.isArray(id)) {
            addIds(id);
          } else {
            if (_.isObject(id)) {
              if (id.type === 'spacer') {
                return;
              }
              id = id.id || id.name;
            }
            var ourId = (nameToId[id] || id).toLowerCase();
            idsToPages[ourId] = currFile;
          }
        });
      }
      addIds(a);
    }
  });
};

runList('api', oldToc[2]);

_.each(oldToc[4][0], id => {
  var name = id.name || id;
  idsToPagesWithNoHash[name] = 'packages/' + name + '.html';
});

_.each(oldToc[6][0], id => {
  idsToPages[id.replace(/\s|\-|\//g, '')] = 'commandline.html';
});

_.each(_.union(_.keys(idsToPages), _.keys(idsToPagesWithNoHash)), id => {
  if (idsToPages[id]) {
    var page = idsToPages[id];
    var name = idToName[id] || id;
    var nameId = name.replace(/[.#]/g, "-");
    console.log(`  /#/full/${id}: '${page}#${nameId}'`);
  } else {
    var page = idsToPagesWithNoHash[id];
    console.log(`  /#/full/${id}: '${page}'`);
  }
});
