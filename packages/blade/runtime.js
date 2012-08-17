/** Blade Run-time helper functions
	(c) Copyright 2012. Blake Miner. All rights reserved.	
	https://github.com/bminer/node-blade
	http://www.blakeminer.com/
	
	See the full license here:
		https://raw.github.com/bminer/node-blade/master/LICENSE.txt
*/
(function() {
	var runtime = typeof exports == "object" ? exports : {};
	var cachedViews = {};
	//Expose Blade runtime via window.blade, if we are running on the browser
	if(runtime.client = typeof window != "undefined")
		window.blade = {'runtime': runtime, 'cachedViews': cachedViews,
			'cb': {}, 'mount': '/views/'};
	
	/* Convert special characters to HTML entities.
		This function performs replacements similar to PHP's ubiquitous
		htmlspecialchars function. The main difference here is that HTML
		entities are not re-escaped; for example, "<Copyright &copy; 2012>"
		will be escaped to: "&lt;Copyright &copy; 2012&gt;" instead of
		"&lt;Copyright &amp;copy; 2012&gt;"
		
		See: http://php.net/manual/en/function.htmlspecialchars.php
	*/
	runtime.escape = function(str) {
		return str == null ? "" : new String(str)
			.replace(/&(?!\w+;)/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}
	
	/* This is a helper function that generates tag attributes and adds	them
		to the buffer.
		
		attrs is an object of the following format:
		{
			"v": attribute_value,
			"e": escape_flag,
			"a": additional_classes_to_be_appended
		}
	*/
	runtime.attrs = function(attrs, buf) {
		for(var i in attrs)
		{
			var attr = attrs[i];
			//If the attribute value is null...
			if(attr.v == null)
			{
				if(attr.a == null)
					continue; //Typically, we ignore attributes with null values
				else
				{
					//If we need to append stuff, just swap value and append
					attr.v = attr.a;
					delete attr.a;
				}
			}
			//Class attributes may be passed an Array or have classes that need to be appended
			if(i == "class")
			{
				if(attr.v instanceof Array)
					attr.v = attr.v.join(" ");
				if(attr.a)
					attr.v = (attr.v.length > 0 ? attr.v + " " : "") + attr.a;
			}
			//Add the attribute to the buffer
			if(attr.e)
				buf.push(" " + i + "=\"" + runtime.escape(attr.v) + "\"");
			else
				buf.push(" " + i + "=\"" + attr.v + "\"");
		}
	}
	
	/* Load a compiled template, synchronously, if possible.
	
		loadTemplate(baseDir, filename, [compileOptions,] cb)
		or
		loadTemplate(filename, [compileOptions,] cb)
		
		Returns true if the file was loaded synchronously; false, if it could not be
		loaded synchronously.
	
		Default behavior in Node.JS is to synchronously compile the file using Blade.
		Default behavior in the browser is to load from the browser's cache, if
		possible; otherwise, the template is loaded asynchronously via a script tag.
	*/
	runtime.loadTemplate = function(baseDir, filename, compileOptions, cb) {
		//Reorganize arguments
		if(typeof compileOptions == "function")
		{
			cb = compileOptions;
			if(typeof filename == "object")
				compileOptions = filename, filename = baseDir, baseDir = "";
			else
				compileOptions = null;
		}
		if(typeof filename == "function")
			cb = filename, filename = baseDir, compileOptions = null, baseDir = "";
		//Arguments are now in the right place
		if(runtime.client)
		{
			filename = runtime.resolve(filename);
			if(cachedViews[filename])
			{
				cb(null, cachedViews[filename]);
				return true;
			}
			var blade = window.blade;
			if(blade.cb[filename])
				throw new Error("Template is already loading. Be patient.");
			//Create script tag
			var st = document.createElement('script');
			st.type = 'application/javascript';
			st.async = true;
			st.src = blade.mount + filename;
			var s = document.getElementsByTagName('script')[0];
			s.parentNode.insertBefore(st, s);
			//Set a timer to throw an Error after a timeout expires.
			var timer = setTimeout(function() {
				delete blade.cb[filename];
				st.parentNode.removeChild(st);
				cb(new Error("Timeout Error: Blade Template [" + filename +
					"] could not be loaded.") );
			}, 15000);
			//Setup callback to be called by the template script
			blade.cb[filename] = function(dependencies, unknownDependencies) {
				clearTimeout(timer);
				delete blade.cb[filename];
				st.parentNode.removeChild(st);
				//Load all dependencies, too
				if(dependencies.length > 0)
				{
					var done = 0;
					for(var i = 0; i < dependencies.length; i++)
						runtime.loadTemplate(baseDir, dependencies[i], compileOptions, function(err, tmpl) {
							if(err) throw err;
							if(++done == dependencies.length)
								cb(null, cachedViews[filename]);
						});
				}
				else
					cb(null, cachedViews[filename]);
			};
			return false;
		}
		else
		{
			compileOptions.synchronous = true;
			require('./blade').compileFile(baseDir + "/" + filename,
				compileOptions, function(err, wrapper) {
					if(err) return cb(err);
					cb(null, wrapper.template);
				}
			);
			return true;
		}
	}
	
	/* This function is a hack to get the resolved URL, so that caching works
		okay with relative URLs */
	runtime.resolve = function(filename) {
		if(runtime.client) {
			var x = document.createElement('div');
			x.innerHTML = '<a href="' + runtime.escape("./" + filename) + '"></a>';
			x = x.firstChild.href;
			x = x.substr(window.location.href.length).replace(/\/\//g, '/');
			if(x.charAt(0) == '/') x = x.substr(1);
			return x;
		}
	};
	
	runtime.include = function(relFilename, info) {
		//Save template-specific information
		var pInc = info.inc,
			pBase = info.base,
			pRel = info.rel,
			pFilename = info.filename,
			pLine = info.line,
			pCol = info.col,
			pSource = info.source,
			pLocals = info.locals;
		info.inc = true;
		//Append .blade for filenames without an extension
		var ext = relFilename.split("/");
		ext = ext[ext.length-1].indexOf(".");
		if(ext < 0)
			relFilename += ".blade";
		//If exposing locals, the included view gets its own set of locals
		if(arguments.length > 2)
		{
			info.locals = {};
			for(var i = 2; i < arguments.length; i += 2)
				info.locals[arguments[i]] = arguments[i+1];
		}
		//Now load the template and render it
		var sync = runtime.loadTemplate(info.base, info.rel + "/" + relFilename,
			runtime.compileOptions, function(err, tmpl) {
				if(err) throw err;
				tmpl(info.locals, function(err, html) {
					//This is run after the template has been rendered
					if(err) throw err;
					//Now, restore template-specific information
					info.inc = pInc;
					info.base = pBase;
					info.rel = pRel;
					info.filename = pFilename;
					info.line = pLine;
					info.col = pCol;
					info.source = pSource;
					info.locals = pLocals;
				}, info);
		});
		if(!sync) throw new Error("Included file [" + info.rel + "/" + relFilename +
			"] could not be loaded synchronously!");
	}
	
	/* Capture the output of a function
		and delete all blocks defined within the function */
	runtime.capture = function(buf, info) {
		var start = info.pos;
		//Delete all blocks defined within the function
		for(var i in buf.blocks)
			if(buf.blocks[i].pos >= start)
				delete buf.blocks[i];
		/* Now remove the content generated by the function from the buffer
			and return it as a string */
		return buf.splice(start, buf.length - start).join("");
	};
	
	/* Define a chunk, a function that returns HTML. */
	runtime.chunk = function(name, func, info) {
		info.chunk[name] = function() {
			//This function needs to accept params and return HTML
			return runtime.capture(info,
				func.apply({'pos': info.length}, arguments) );
		};
	};
	
	/* Copies error reporting information from a block's buffer to the main
		buffer */
	function blockError(buf, blockBuf) {
		buf.filename = blockBuf.filename;
		buf.line = blockBuf.line;
		buf.col = blockBuf.col;
	}
	
	/* Defines a block */
	runtime.blockDef = function(blockName, buf, childFunc) {
		var block = buf.blocks[blockName] = {
			'parent': buf.block || null, //set parent block
			'buf': [], //block get its own buffer
			'pos': buf.length, //block knows where it goes in the main buffer
			'numChildren': 0 //number of child blocks
		};
		//Copy some properties from buf into block.buf
		var copy = ['r', 'blocks', 'func', 'locals', 'cb', 'base', 'rel'];
		for(var i in copy)
			block.buf[copy[i]] = buf[copy[i]];
		/* Set the block property of the buffer so that child blocks know
		this is their parent */
		block.buf.block = block;
		//Update numChildren in parent block
		if(block.parent)
			block.parent.numChildren++;
		//Leave a spot in the buffer for this block
		buf.push('');
		//If parameterized block
		if(childFunc.length > 1)
			block.paramBlock = childFunc;
		else
		{
			try {childFunc(block.buf); }
			catch(e) {blockError(buf, block.buf); throw e;}
		}
	};
	
	/* Render a parameterized block
		type can be one of:
			"a" ==> append (the default)
			"p" ==> prepend
			"r" ==> replace
	*/
	runtime.blockRender = function(type, blockName, buf) {
		var block = buf.blocks[blockName];
		if(block == null)
			throw new Error("Block '" + blockName + "' is undefined.");
		if(block.paramBlock == null)
			throw new Error("Block '" + blockName +
				"' is a regular, non-parameterized block, which cannot be rendered.");
		//Extract arguments
		var args = [block.buf];
		for(var i = 3; i < arguments.length; i++)
			args[i-2] = arguments[i];
		if(type == "r") //replace
			block.buf.length = 0; //an acceptable way to empty the array
		var start = block.buf.length;
		//Render the block
		try{block.paramBlock.apply(this, args);}
		catch(e) {blockError(buf, block.buf); throw e;}
		if(type == "p")
			prepend(block, buf, start);
	}
	
	/* Take recently appended content and prepend it to the block, fixing any
		defined block positions, as well. */
	function prepend(block, buf, start) {
		var prepended = block.buf.splice(start, block.buf.length - start);
		Array.prototype.unshift.apply(block.buf, prepended);
		//Fix all the defined blocks, too
		for(var i in buf.blocks)
			if(buf.blocks[i].parent == block && buf.blocks[i].pos >= start)
				buf.blocks[i].pos -= start;
	}
	
	/* Append to, prepend to, or replace a defined block.
		type can be one of:
			"a" ==> append
			"p" ==> prepend
			"r" ==> replace
	*/
	runtime.blockMod = function(type, blockName, buf, childFunc) {
		var block = buf.blocks[blockName];
		if(block == null)
			throw new Error("Block '" + blockName + "' is undefined.");
		if(type == "r") //replace
		{
			//Empty buffer and delete parameterized block function
			delete block.paramBlock;
			block.buf.length = 0; //empty the array (this is an accepted approach, btw)
		}
		var start = block.buf.length;
		//If parameterized block (only works for type == "r")
		if(childFunc.length > 1)
			block.paramBlock = childFunc;
		else
		{
			try {childFunc(block.buf);}
			catch(e) {blockError(buf, block.buf); throw e;}
		}
		if(type == "p") //prepend
			prepend(block, buf, start);
	};
	
	/* Inject all blocks into the appropriate spots in the main buffer.
		This function is to be run when the template is done rendering.
		Although runtime.done looks like a O(n^2) operation, I think it is
		O(n * max_block_depth) where n is the number of blocks. */
	runtime.done = function(buf) {
		//Iterate through each block until done
		var done = false;
		while(!done)
		{
			done = true; //We are done unless we find work to do
			for(var i in buf.blocks)
			{
				var x = buf.blocks[i];
				if(!x.done && x.numChildren == 0)
				{
					//We found work to do
					done = false;
					//Insert the buffer contents where it belongs
					if(x.parent == null)
						buf[x.pos] = x.buf.join("");
					else
					{
						x.parent.buf[x.pos] = x.buf.join("");
						x.parent.numChildren--;
					}
					x.done = true;
				}
			}
		}
	};
	
	/* Adds error information to the error Object and returns it */
	runtime.rethrow = function(err, info) {
		if(info == null)
			info = err;
		//prevent the same error from appearing twice
		if(err.lastFilename == info.filename && err.lastFilename != null)
			return err;
		info.column = info.column || info.col;
		//Generate error message
		var msg = err.message + "\n    at " +
			(info.filename == null ? "<anonymous>" : info.filename) + 
			(info.line == null ? "" : ":" + info.line +
				(info.column == null ? "" : ":" + info.column) );
		if(info.source != null)
		{
			const LINES_ABOVE_AND_BELOW = 3;
			var lines = info.source.split("\n"),
				start = Math.max(info.line - LINES_ABOVE_AND_BELOW, 0),
				end = Math.min(info.line + LINES_ABOVE_AND_BELOW, lines.length),
				digits = new String(end).length;
			lines = lines.slice(start, end);
			msg += "\n\n";
			for(var i = 0; i < lines.length; i++)
				msg += pad(i + start + 1, digits) +
					(i + start + 1 == info.line ? ">\t" : "|\t") +
					lines[i] + "\n";
		}
		err.message = msg;
		err.lastFilename = info.filename;
		//Only set these properties once
		if(err.filename == null && err.line == null)
		{
			err.filename = info.filename;
			err.line = info.line;
			err.column = info.column;
		}
		return err;
	};
	
	//A rather lame implementation, but it works
	function pad(number, count) {
		var str = number + " ";
		for(var i = 0; i < count - str.length + 1; i++)
			str = " " + str;
		return str;
	}
})();
