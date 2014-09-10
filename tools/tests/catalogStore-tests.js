var selftest = require('../selftest.js');
var CatalogStore = require('../catalog-remote.js');
var fs = require('fs');
var _ = require('underscore');

//TODO
//Tests to write
//Test when the DB is busted
//Test to make sure that the entries are not loaded twice
//getSortedVersions : function(name) --> test result case and make sure it is  []
selftest.define("catalogStoreInsert", [], function () {
	// console.log("catalogstore is ");
	// console.log(typeof CatalogStore);
	
	var data = fs.readFileSync('/Users/pascalrapicault/.meteor/package-metadata/v1/packages.data.json', 'utf8');
	var ret = JSON.parse(data)
	
    var cs = new CatalogStore.RemoteCatalog();
	cs.insertData(ret);
});

selftest.define("catalogGetName", [], function () {
	// console.log("catalogstore is ");
	// console.log(typeof CatalogStore);
	
	var data = fs.readFileSync('/Users/pascalrapicault/.meteor/package-metadata/v1/packages.data.json', 'utf8');
	var ret = JSON.parse(data)
	
	var cs = new CatalogStore.CatalogStore();

	selftest.expectEqual(4, cs.getPackage("accounts-base").length);
	console.log( cs.getVersion("accounts-base", "1.0.1-rc0"));
	// selftest.expectEqual(1, cs.getVersion("accounts-base", "1.0.1-rc0").length);
    selftest.expectEqual(null, cs.getVersion("doesnotexists", "1.0.1-rc0"));
    selftest.expectEqual(3, cs.getAllBuilds("npm-node-aes-gcm", "0.1.3").length);

    // add test for 
    // console.log(cs.getAllBuilds("npm-node-aes-gcm", "0.1.3"));
    console.log(cs.getSortedVersions("npm-node-aes-gcm")); //check for a case with multiple versions
    console.log(cs.getLatestMainlineVersion("npm-node-aes-gcm"));
    console.log(cs.getReleaseTrack("METEOR-CORE"));
    console.log(cs.getReleaseVersion("METEOR", "0.9.2-rc0"));
    console.log(cs.getAllReleaseTracks());
});