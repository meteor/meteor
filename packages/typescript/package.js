Package.describe({
  summary: "Javascript dialect with types"
});


var fs = require('fs');
var TypeScript = require('typescript-wrapper');

compile_by_api = function (bundle, source_path, serve_path, where) {
  serve_path = serve_path + '.js';
  temp_path = '/tmp/' + (Math.random() * 0x10000000 + 1).toString(36) + '.js';
  
  var fd = fs.openSync(temp_path, 'w'); 

  var outFile = { 
    Write: function (str) { 
        fs.writeSync(fd, str); 
    }, 
    WriteLine: function (str) {
    console.log(fd, str); 
        fs.writeSync(fd, str + '\r\n'); 
    }, 
    Close: function () { 
        fs.closeSync(fd); 
        fd = null; 
            var contents = fs.readFileSync(temp_path, "utf-8");
            fs.unlink(temp_path);
            bundle.add_resource({
              type: "js",
              path: serve_path,
              data: contents,
              where: where
            });
    }
  }

  var stderr = {
    Write: function (str) { 
        process.stderr.write(str); 
    }, 
    WriteLine: function (str) { 
        process.stderr.write(str + '\n'); 
    }, 
    Close: function () { 
    } 
  }

  try {
    console.log("Compiling TypeScript: " + source_path);
    var contents = fs.readFileSync(source_path, "utf-8");
    var compiler = new TypeScript.TypeScriptCompiler(outFile);
    compiler.setErrorOutput(stderr);
    compiler.addUnit(contents, source_path);
    compiler.typeCheck();
    compiler.emit(false);
    outFile.Close();
  } catch (e) {
    return bundle.error(e.message);
  }

}

Package.register_extension(
  "ts", compile_by_api
);

Package.on_test(function (api) {
  api.add_files(['typescript_tests.ts', 'typescript_tests.js'],
                ['client', 'server']);
});
