var path = require('path');
var blade = require('blade');

Package.describe({
	summary: "Blade - HTML Template Compiler, inspired by Jade & Haml"
});

Package.register_extension("blade", function(bundle, srcPath, servePath, where) {
	if(where !== "client") return; //get outta here, yo!
	//The template name does not contain ".blade" file extension or a beginning "/"
	var templateName = path.dirname(servePath).substr(1) + "/" + path.basename(servePath, ".blade");
	//Templates are assumed to be stored in "views/", so remove this from the name, if needed
	if(templateName.substr(0, 6) == "views/")
		templateName = templateName.substr(6);
	//Finally, tell the Blade compiler where these views are stored, so that file includes work
	//the location of meteor project = srcPath.substr(0, srcPath.length - servePath.length)
	var basedir = srcPath.substr(0, srcPath.length - servePath.length) + "/views";
	blade.compileFile(srcPath, {
		'synchronous': true, //undocumented Blade property
		'basedir': basedir,
		'cache': false, //disabled because we only compile each file once anyway?
		'minify': false, //for debugging
		'includeSource': true //for debugging
	}, function(err, tmpl) {
		bundle.add_resource({
			type: 'js',
			path: "/views/" + templateName + ".js", //This can be changed to whatever
			data: new Buffer("Meteor.startup(function(){blade.cachedViews[" +
				//just put the template itself in blade.cachedViews
				JSON.stringify(templateName + ".blade") + "]=" + tmpl.toString() + ";" +
				//special support for index.blade
				(templateName == "index" ? "document.body.appendChild(Meteor.ui.render(": "") +
				//define a template with the proper name
				"Meteor._def_template(" + JSON.stringify(templateName) +
					//when the template is called...
					", function(data, obj) {data = data || {};" +
						//helpers work...
						"for(var i in obj.helpers) if(typeof obj.helpers[i] == 'function')" +
							"data[i]=obj.helpers[i]();" +
						/*call the actual Blade template here, passing in data
							`ret` is used to capture async results.
							Note that since we are using caching for file includes,
							there is no async. All code is ran synchronously. */
						"var ret = ''; blade.cachedViews[" + JSON.stringify(templateName + ".blade") +
						"](data,function(err,html) {" +
							"if(err) throw err; ret = html;" +
						//so... by here, we can just return `ret`, and everything works okay
						"}); return ret;" +
						"}" +
					")" +
				(templateName == "index" ? "))": "") +
				"});"),
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