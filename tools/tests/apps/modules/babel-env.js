function babeltest() {
  // use transform-do-expressions plugin to prove babel `env` subkey was loaded
  let x = do {
      1;
  };
  console.log(x)
}

/*
  If the plugin is loaded correctly there will be no errors during the compilation of this file.
  Without this plugin you will get the error:

  W20170803-17:58:17.054(-7)? (STDERR)   var x = do {
   W20170803-17:58:17.055(-7)? (STDERR)           ^^
   W20170803-17:58:17.055(-7)? (STDERR) 
   W20170803-17:58:17.055(-7)? (STDERR) SyntaxError: Unexpected token do
*/

