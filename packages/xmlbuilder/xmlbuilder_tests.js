const expectedResult = `<?xml version="1.0"?><widget id="com.meteor.xmlbuilder_test" version="0.0.1" android-versionCode="28" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0"><name>XmlBuilderTest</name><description>This is a Meteor test case</description><author href="http://cordova.io" email="dev@cordova.apache.org">Meteor Developer</author><preference name="webviewbounce" value="false"/><preference name="DisallowOverscroll" value="true"/><universal-links><host name="localhost:3000"/></universal-links><content src="http://localhost:3000/"/><allow-intent href="tel:*"/><allow-intent href="geo:*"/><allow-intent href="mailto:*"/><allow-intent href="sms:*"/><allow-intent href="market:*"/><allow-intent href="itms:*"/><allow-intent href="itms-apps:*"/><allow-navigation href="http://localhost"/><platform name="ios"/><platform name="android"/></widget>`;

const accessRules = {
    'tel:*': { type: 'intent' },
    'geo:*': { type: 'intent' },
    'mailto:*': { type: 'intent' },
    'sms:*': { type: 'intent' },
    'market:*': { type: 'intent' },
    'itms:*': { type: 'intent' },
    'itms-apps:*': { type: 'intent' },
    'http://localhost': { type: 'navigation' }
};

const metadata = {
    version: '0.0.1',
    buildNumber: undefined,
    description: 'New Meteor Mobile App',
    author: 'A Meteor Developer',
    email: 'n/a',
    website: 'n/a',
    contentUrl: `http://localhost:3000/`
};

const additionalConfiguration = {
    global: {
        'webviewbounce': false,
        'DisallowOverscroll': true
    },
    platform: {
        ios: {},
        android: {}
    }
};

const custom = [`<universal-links><host name="localhost:3000"/></universal-links>`];


Tinytest.add("xmlbuilder - config.xml file generation", function (test) {
    let config = XmlBuilder.create({ version: '1.0' }).ele('widget');

    // Set the root attributes
    _.each({
        id: 'com.meteor.xmlbuilder_test',
        version: metadata.version,
        'android-versionCode': '28',
        'ios-CFBundleVersion': null,
        xmlns: 'http://www.w3.org/ns/widgets',
        'xmlns:cdv': 'http://cordova.apache.org/ns/1.0'
    }, (value, key) => {
        if (value) {
            config.att(key, value);
        }
    });

    // Set the metadata
    config.ele('name').txt('XmlBuilderTest');
    config.ele('description').txt('This is a Meteor test case');
    config.ele('author', {
        href: 'http://cordova.io',
        email: 'dev@cordova.apache.org'
    }).txt('Meteor Developer');

    // Set the additional global configuration preferences
    _.each(additionalConfiguration.global, (value, key) => {
        config.ele('preference', {
            name: key,
            value: value.toString()
        });
    });

    // Set custom tags into widget element
    _.each(custom, elementSet => {
        const tag = config.ele(elementSet);
    });

    config.ele('content', { src: metadata.contentUrl });

    // Copy all the access rules
    _.each(accessRules, (options, pattern) => {
        const type = options.type;
        options = _.omit(options, 'type');

        if (type === 'intent') {
            config.ele('allow-intent', { href: pattern });
        } else if (type === 'navigation') {
            config.ele('allow-navigation', _.extend({ href: pattern }, options));
        } else {
            config.ele('access', _.extend({ origin: pattern }, options));
        }
    });

    const platformElement = {
        ios: config.ele('platform', { name: 'ios' }),
        android: config.ele('platform', { name: 'android' })
    }

    // Set the additional platform-specific configuration preferences
    _.each(additionalConfiguration.platform, (prefs, platform) => {
        _.each(prefs, (value, key) => {
            platformElement[platform].ele('preference', {
                name: key,
                value: value.toString()
            });
        });
    });

    const formattedXmlConfig = config.end();
    test.equal(formattedXmlConfig, expectedResult);
});



