Tinytest.add('npm-mongo - redacts credentials in invalid MongoDB URLs', function (test) {
  const cases = [
    {
      url: 'mongodb://user:pa@ss@host/database',
      redactedUrl: 'mongodb://***:***@host/database',
    },
    {
      url: 'mongodb://user:pa%40ss@host/database',
      redactedUrl: 'mongodb://***:***@host/database',
    },
    {
      url: 'mongodb+srv://user:password@cluster.example/database',
      redactedUrl: 'mongodb+srv://***:***@cluster.example/database',
    },
    {
      url: 'mongodb://host/database',
      redactedUrl: 'mongodb://host/database',
    },
  ];

  cases.forEach(({ url, redactedUrl }) => {
    test.equal(NpmMongoTest.redactMongoUrl(url), redactedUrl);
  });
});
