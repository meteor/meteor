if (Meteor.isServer) {
  var passed = true;
  var expectText = "Test\n";

  if (Assets.getText("test.txt") !== expectText)
    throw new Error("getText test.txt does not match");
  if (TestAsset.convert(Assets.getBinary("test.txt"))
      !== expectText)
    throw new Error("getBinary test.txt does not match");

  Assets.getText("test.txt", function (err, result) {
    if (err || result !== expectText)
      throw new Error("async getText test.txt does not match");
    Assets.getBinary("test.txt", function (err, result) {
      if (err || TestAsset.convert(result) !== expectText)
        throw new Error("async getBinary test.txt does not match");
      TestAsset.go(true /* exit when done */);
    });
  });
}
