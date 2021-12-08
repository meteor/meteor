// sort of hacky but allows x:y
module.exports = function(args) {
  if (args.length === 0) {
    return {};
  }
  var argsJson = '{"' + args.join('","').replace(/:/g, '":"') + '"}';
  try {
    return JSON.parse(argsJson);
  } catch (e) {
    console.error(args, argsJson);
    throw new Error("Couldn't parse arguments");
  }
}
