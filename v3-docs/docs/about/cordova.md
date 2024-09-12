
# Cordova

Meteor allows developers to build mobile applications using web technologies like HTML, CSS, and JavaScript, while also accessing native mobile capabilities. This integration is made with [Apache Cordova](https://cordova.apache.org).

Cordova apps run in a web view, which is like a browser without the UI. Different browser engines have varying implementations and support for web standards. This means the web view your app uses can greatly affect its performance and available features. (For details on supported features across browsers and versions, check caniuse.com.)

There is a [Meteor Cordova guide](https://guide.meteor.com/cordova) available that offers advanced configuration details for Meteor Cordova projects. Feel free to refer to it while we update the information in the new documentation.

This section will summarize the steps needed to set up your environment for Meteor Cordova development, manage development, and generate native artifacts for store uploads.

## Pre-Installation

Before you begin, make sure your development environment meets the following requirements:

### Android

#### Java

For Android development, Cordova requires the JDK.

``` sh
# On Debian/Ubuntu:
sudo apt-get update
sudo apt-get install openjdk-17-jdk

# On Mac OSX
brew install openjdk@17
sudo ln -sfn $(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk

# using sdkman
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk install java 17
sdk default java 17

java -version  # Verify installation
```

Ensure `JAVA_HOME` environment variable is set by adding it to `~/.bashrc` or `~/.zshrc` :

``` sh
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
export PATH=$JAVA_HOME/bin:$PATH
```

Run `echo $JAVA_HOME` to check the current Java version. If it's incorrect, manually set the correct path by finding where Java is installed.

#### Android SDK

For Android builds, you will need the Android SDK. You can install it via [Android Studio](https://developer.android.com/studio).

Once Android Studio is installed, go to **SDK Manager** and install the required SDK packages. The minimum required version is Android SDK 34. Install the `Android SDK Command-line Tools (latest)` as well.

Ensure `ANDROID_HOME` environment variable is set by adding it to `~/.bashrc` or `~/.zshrc` :

```sh
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=${ANDROID_HOME}
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH
```

#### Gradle

If Gradle cannot be found install it with:

```sh
# On Mac OSX:
brew install gradle

# On Debian/Ubuntu:
sudo apt-get install gradle

# using sdkman
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk install gradle 8.7

gradle --version  # Verify installation
```

### iOS

For iOS development, you will need Xcode (macOS only).

Install [Xcode](https://apps.apple.com/us/app/xcode/id497799835?mt=12) from the App Store.

After installing, ensure that the **command-line tools** are installed:

```sh
xcode-select --install
```

Once the download and installation are finished, you'll need to accept the license agreement. When you open Xcode for the first time, a dialog will appear with the agreement for you to review and accept. You can then close Xcode. Or use the next command on the command line.

```sh
sudo xcodebuild -license accept
```

Also, install CocoaPods, which is needed to manage iOS project dependencies:

```sh
sudo gem install cocoapods
```

## Development

Once you have all the prerequisites set up, you can quickly get a mobile project running.

### Add platforms

To develop a mobile app, you need to add the platforms (iOS and Android) for Cordova:

```sh
# Android
meteor add-platform android

# iOS (only works on macOS)
meteor add-platform ios
```

### Run emulator

You can now run the application in development mode using the `meteor run` command:

```sh
# Android
meteor run android

# iOS (only works on macOS)
meteor run ios
```

### Run physical device

To run on a physical device, ensure the device is connected via USB:

```sh
# Android
meteor run android-device

# iOS (only works on macOS)
meteor run ios-device
```

### Open IDE

Once you have set up your Meteor project with Cordova, you may want to run or debug your mobile app using **Android Studio** or **XCode** directly. This can be useful for advanced debugging, custom configurations, or accessing specific platform tools

#### Open in Android Studio

1. Open **Android Studio**
2. Click on **"Open an existing Android Studio project"**
3. Navigate to your Meteor project directory:  
   `.meteor/local/cordova-build/platforms/android/`
4. Open the project

Now you can manage your app with **Android Studio**, including connecting to physical devices or emulators, reviewing code, using debugging tools, and more.

#### Open in XCode

1. Open **XCode**
2. Navigate to the Meteor project directory:  
   `.meteor/local/cordova-build/platforms/ios/`
3. Open the project or the `.xcworkspace` file

Now you can manage your app with **XCode**, including connecting to physical devices or emulators, reviewing code, using debugging tools, and more.

## Production

### Build

Once development is complete, you’ll need to build the actual mobile application (APK/AAB for Android or IPA for iOS) to distribute to users or upload to the app stores.

```sh
meteor build ../build-output --server=https://your-server-url.com
```

### Distribute

After building your Cordova project with Meteor, you can use **Android Studio** for Android and **Xcode** for iOS to handle signing and creating the final artifacts.

#### Android

1. Open **Android Studio**
2. Click on **"Open an existing Android Studio project"**
3. Navigate to your Meteor project directory:  
   `./build-output/android/project`
4. Open the project
5. Go to **Build > Generate Signed Bundle / APK**
6. Follow the prompts to create or use a keystore, [configure signing](https://developer.android.com/studio/publish/app-signing#sign-apk), and build the APK/ABB.
7. Upload the APK/ABB to Play Store using Google Play Console


#### iOS

1. Open **XCode**
2. Navigate to the Meteor project directory:  
   `../build-output/ios/project`
3. Open the project or the `.xcworkspace` file
4. [Configure Signing in Xcode](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates)
5. Go to **Product > Archive** to create an archive of your app
6. In the **Organizer** window, click **Distribute App** and follow the prompts to configure signing and export the IPA file.
7. Upload the IPA file to the App Store or distribute via TestFlight.
