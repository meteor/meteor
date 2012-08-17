var path = require('path');
var blade;
//Hopefully, sometime soon I'll be able to get rid of this horrible hack...
try {
	blade = require('blade');
}
catch(e) {
	//XXX super lame! we actually have to give paths relative to
	// app/inner/app.js, since that's who's evaling us.
	blade = require('../../packages/blade/node_modules/blade');
}
//-- end of horrible hack

Package.describe({
	summary: "Blade - HTML Template Compiler, inspired by Jade & Haml"
});

Package.register_extension("blade", function(bundle, srcPath, servePath, where) {
	if(where !== "client") return; //get outta here, yo!
	//The template name does not contain ".blade" file extension or a beginning "/"
	var templateName = path.dirname(servePath).substr(1);
	templateName += (templateName.length > 0 ? "/" : "") + path.basename(servePath, ".blade");
	//Templates are assumed to be stored in "views/", so remove this from the name, if needed
	if(templateName.substr(0, 6) == "views/")
		templateName = templateName.substr(6);
	//Finally, tell the Blade compiler where these views are stored, so that file includes work.
	//The location of meteor project = srcPath.substr(0, srcPath.length - servePath.length)
	var basedir = srcPath.substr(0, srcPath.length - servePath.length) + "/views";
	blade.compileFile(srcPath, {
		'synchronous': true,
		'basedir': basedir,
		'cache': false, //disabled because we only compile each file once anyway
		'minify': false, //would be nice to have access to `no_minify` bundler option
		'includeSource': true //default to true for debugging
	}, function(err, tmpl) {
		if(err) throw err;
		if(templateName == "head")
			tmpl({}, function(err, html) {
				//This should happen synchronously due to compile options set above
				if(err) throw err;
				bundle.add_resource({
					type: 'head',
					data: html,
					where: where
				});
			});
		else if(templateName == "body")
			tmpl({}, function(err, html) {
				//This should happen synchronously due to compile options set above
				if(err) throw err;
				bundle.add_resource({
					type: 'body',
					data: html,
					where: where
				});
			});
		bundle.add_resource({
			type: 'js',
			path: "/views/" + templateName + ".js", //This can be changed to whatever
			data: new Buffer("blade.cachedViews[" +
				//just put the template itself in blade.cachedViews
				JSON.stringify(templateName + ".blade") + "]=" + tmpl.toString() + ";" +
				//define a template with the proper name
				"Meteor._def_template(" + JSON.stringify(templateName) +
					//when the template is called...
					", function(data, obj) {data = data || {};" +
						//helpers work...
						"for(var i in obj.helpers)\n" +
							"if(typeof obj.helpers[i] == 'function') " +
								"data[i]=obj.helpers[i]();" +
						/*call the actual Blade template here, passing in data
							`ret` is used to capture async results.
							Note that since we are using caching for file includes,
							there is no async. All code is ran synchronously. */
						"var ret = ''; blade.cachedViews[" + JSON.stringify(templateName + ".blade") +
						"](data, function(err,html) {" +
							"if(err) throw err; ret = html;" +
						"});\n" +
						//so... by here, we can just return `ret`, and everything works okay
						"return ret;" +
					"}" +
				");"),
			where: where
		});
	});
});

Package.on_use(function(api) {
	//The plain-old Blade runtime
	api.add_files('runtime.js', 'client');
	//The Blade runtime with overridden loadTemplate function, designed for Meteor
	api.add_files('runtime-meteor.js', 'client');
});
