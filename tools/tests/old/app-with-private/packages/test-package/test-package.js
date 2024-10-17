TestAsset = {};

if (Meteor.isServer) {
  TestAsset.convert = function (b) {
    return Buffer.from(b).toString();
  };

  TestAsset.go = async function (exit) {
    var expectText = "Package\n";

    if (await Assets.getTextAsync("test-package.txt") !== expectText)
      throw new Error("getText test-package.txt does not match");

    if (TestAsset.convert(await Assets.getBinaryAsync("test-package.txt"))
      !== expectText)
      throw new Error("getBinary test-package.txt does not match");

    if (await Assets.getTextAsync("test.notregistered") !== "No extension handler\n")
      throw new Error("File with unregistered extension does not match");

    const result1 = await Assets.getTextAsync("test-package.txt")

    if (result1 !== expectText)
      throw new Error("async getText test-package.txt does not match");

    const result2 = await Assets.getBinaryAsync("test-package.txt")

    if (TestAsset.convert(result2) !== expectText)
      throw new Error("async getBinary test-package.txt does not match");

    if (exit)
      process.exit(0);
  }
}
