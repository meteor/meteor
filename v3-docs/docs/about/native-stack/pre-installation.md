---
outline:
  level: [2, 3]
---

# Native Pre-Installation

Meteor native apps need the Android and iOS platform tooling installed before you can run or build native projects.

These requirements apply to both native integrations:

- [Capacitor (mobile)](./capacitor-mobile.md)
- [Cordova (Legacy mobile)](../cordova.md)

The native integration you choose controls the project structure and runtime, but Android and iOS builds still depend on the same platform toolchains.

:::info
This page covers shared platform setup only. Use the Capacitor and Cordova sections for integration-specific commands, project structure, and runtime behavior.
:::

## Android

### Java

For Android development, install the JDK.

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

Ensure `JAVA_HOME` environment variable is set by adding it to `~/.bashrc` or `~/.zshrc`:

``` sh
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(which java))))
export PATH=$JAVA_HOME/bin:$PATH
```

Run `echo $JAVA_HOME` to check the current Java version. If it is incorrect, manually set the correct path by finding where Java is installed.

#### Windows

To install Java on Windows, [download the Java 17 executable](https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html) and run the installer.

Ensure the `JAVA_HOME` environment variable is set globally in your system path:

1. Open System Properties: Press Windows Key + Pause/Break or right-click This PC > Properties.
2. Click Advanced system settings.
3. Click the Environment Variables button.
4. Under System Variables, click New.
5. Set Variable Value to the path to your JDK, for example `C:\Program Files\Java\jdk-17`.
6. Click New and add `%JAVA_HOME%\bin`.
7. Click OK to save all changes.

Verify the installation in a terminal by running `echo %JAVA_HOME%`.

Alternatively, you can set the environment variable in a terminal each time you work with a Meteor native app:

``` sh
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:PATH += ";%JAVA_HOME%\bin"
```

### Android SDK

For Android builds, you need the Android SDK. You can install it via [Android Studio](https://developer.android.com/studio).

Once Android Studio is installed, go to **SDK Manager** and install the required SDK packages. The minimum required version is Android SDK 35. Install the `Android SDK Command-line Tools (latest)` as well.

Ensure `ANDROID_HOME` environment variable is set by adding it to `~/.bashrc` or `~/.zshrc`:

```sh
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=${ANDROID_HOME}
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH
```

#### Windows

Ensure `ANDROID_HOME` environment variable is set globally on the system configuration or by setting the environment variables in the terminal.

``` ps
$env:ANDROID_HOME = "C:\Users\<USER>\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\tools;$env:ANDROID_HOME\tools\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
```

### Gradle

If Gradle cannot be found, install it with:

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

#### Windows

Install Gradle on your Windows system [by following the official guide](https://gradle.org/install).

Make sure the Gradle path is included in your system's PATH variable.

```ps
$env:PATH += ";C:\Gradle\gradle-8.10.2\bin"
```

### Android emulators

Use Android Studio to create or start Android emulators:

1. Open **AVD Manager**: Go to **Tools** > **AVD Manager**.
2. Click **Create Virtual Device...**.
3. Choose a hardware profile and click **Next**.
4. Select a system image and click **Next**.
5. Configure the device and click **Finish**.
6. Click the **green play icon** to start the emulator.

## iOS

For iOS development, you need Xcode. iOS development only works on macOS.

Install [Xcode](https://apps.apple.com/us/app/xcode/id497799835?mt=12) from the App Store.

After installing, ensure the **command-line tools** are installed:

```sh
xcode-select --install
```

Once the download and installation are finished, accept the license agreement. When you open Xcode for the first time, a dialog will appear with the agreement for you to review and accept. You can then close Xcode. Or use this command:

```sh
sudo xcodebuild -license accept
```

Install CocoaPods, which is needed to manage iOS project dependencies:

```sh
sudo gem install cocoapods
```

### iOS simulators

Use Xcode to create or start iOS simulators. Open Xcode and choose the desired simulator device from the device list at the top.
