blade.runtime.loadTemplate = function(baseDir, filename, compileOptions, cb) {
	//Either pull from the cache or return an error
	filename = blade.runtime.resolve(filename);
	if(blade.cachedViews[filename])
		return cb(null, blade.cachedViews[filename]);
	else
		return cb(new Error("Template '" + filename + "' could not be loaded.") );
};