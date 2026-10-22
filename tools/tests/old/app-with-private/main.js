if (Meteor.isServer) {
  var passed = true;
  var expectText = "Test\n";

  if (await Assets.getTextAsync("test.txt") !== expectText)
    throw new Error("getText test.txt does not match");

  if (TestAsset.convert(await Assets.getBinaryAsync("test.txt")) !== expectText)
    throw new Error("getBinary test.txt does not match");

  const result1 = await Assets.getTextAsync("test.txt")

  if (result1 !== expectText)
    throw new Error("async getText test.txt does not match");

  const result2 = await Assets.getBinaryAsync("test.txt")

  if (TestAsset.convert(result2) !== expectText)
    throw new Error("async getBinary test.txt does not match");

  await TestAsset.go(true /* exit when done */);
}
