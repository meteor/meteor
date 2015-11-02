# Mobile outline

1. Introduction to Meteor's built-in mobile integration
    1. Based on Cordova
    2. UI and logic are still written in HTML and JavaScript, but it's better than a mobile website since all of the code is running locally!
    3. You can use Cordova plugins as a bridge to native functionality
    4. Update your app outside of the regular app store process
    5. Downside: UI can sometimes feel less than native if you aren't careful
2. Installing prerequisites
    1. Meteor prompts you automatically
    2. Link to the appropriate pages:
        1. iOS on Mac
        2. Android on Mac
        3. Android on Linux
        4. Windows support in the pipeline, in the meantime the best bet is to... install a Linux VM? Investigate the Vagrant build solution. Question here.
3. Development environment
    1. Running your app in a simulator/emulator for development
        1. iOS on Mac, your best bet is to use Xcode via meteor run ios-device - ios-sim is convenient for a demo, but doesn't let you configure anything
        2. Android, run meteor run android, make sure you have acceleration installed or it will be ultra slow.
            1. How to configure different emulators
    2. Logging
        1. See server-side logs in the terminal as usual
        2. Android
            1. Meteor prints them for you in the terminal, but for more in-depth stuff, see below
            2. See client-side JS logs and debug stuff in the Chrome inspector with the inspect devices tool: https://developers.google.com/web/tools/chrome-devtools/debug/remote-debugging/remote-debugging?hl=en
            3. Native logs for Cordova plugins and Meteor native code exceptions with Android Device Monitor: http://developer.android.com/tools/help/monitor.html
        3. iOS
            1. JavaScript logging in Safari web inspector
            2. Native logs in Xcode when running your app
        4. Question: where exactly do we capture logs correctly and log them to terminal?
    3. Testing
    4. Debugging
4. Designing for mobile - see UX article (XXX need to PR that outline)
    1. Credit: https://github.com/awatson1978/meteor-cookbook/blob/master/cookbook/mobile.md
    2. Media queries/CSS libraries
    3. Scroll bounce
    4. Swiping
    5. Animations
5. Native functionality with Cordova plugins
    1. How to add a plugin with meteor add cordova:something, or depending on it in a package
    2. Make sure to wait until Meteor.startup for plugins to load
    3. Cordova plugins can be a bit of a gamble, since it's hard to make native code that works on a wide variety of devices. Your best bet is to test on a certain set of devices/OS versions yourself
    4. Search for plugins on https://cordova.apache.org/plugins/
    5. Useful lists of plugins
        1. http://docs.telerik.com/platform/appbuilder/creating-your-project/using-plugins/using-core-plugins/using-core-plugins
        2. Microsoft plugin kits: http://taco.tools/docs/validated-kits.html
6. Hot code push on mobile
    1. Dangers
        1. If you deploy broken code, your users will get it in their app and it won't ever work again
        2. percolate:safe-reload
        3. You need a new app to use new Cordova plugins; so if you add any you need to make sure their app shell has the right plugins
    2. Controlling when reload happens
        1. Different states your app can be in
            1. Never hot code pushed, fresh
            2. New update currently downloading
            3. New update downloaded, not reloaded yet
            4. Reloaded to a new updated version
        2. reload-on-resume
        3. Special case: when your app needs to hot code push right after the user downloaded it; you should display an upgrade screen in this case
7. Push notifications
    1. Raix:push just works
8. Accessing local files
    1. Files/assets from the app bundle
    2. Local files (not possible in Meteor 1.2, we're working on it)
9. Offline data
    1. Not sure if GroundDB covers this
    2. You can use Cordova plugins for SQLite across different platforms
    3. You might need to migrate data across different app versions
10. Configuring your project
    1. App icons
    2. Preferences
    3. Overriding parts of the Xcode project
11. Deploying to the app store
    1. Android: https://github.com/meteor/meteor/wiki/How-to-submit-your-Android-app-to-Play-Store
    2. iOS: https://github.com/meteor/meteor/wiki/How-to-submit-your-iOS-app-to-App-Store
        1. TestFlight
