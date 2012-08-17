Template.pkg_absolute_url.absoluteUrl = {
  id: "meteor_absoluteUrl",
  name: "Meteor.absoluteUrl([path], [options])",
  locus: "Anywhere",
  descr: ["Generate an absolute URL pointing to the application."],
  args: [
    {name: "path",
     type: "String",
     descr: 'A path to append to the root URL. Do not include a leading "`/`".'
    }
  ],
  options: [
    {name: "secure",
     type: "Boolean",
     descr: "Create an HTTPS URL."
    },
    {name: "rootUrl",
     type: "String",
     descr: "Override the default ROOT_URL from the server environment. For example: \"`http://foo.example.com`\""
    }
  ]

};

