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

Capacitor 8 requires JDK 21. The commands below install that version; for
Cordova, use JDK 17 by replacing `21` with `17` in the commands and paths.

On Debian/Ubuntu:

``` sh
sudo apt-get update
sudo apt-get install openjdk-21-jdk
sudo update-alternatives --config java
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
```

If more than one Java version is installed, select the version required by your integration.

On macOS with Homebrew:

``` sh
brew install openjdk@21
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
```

After the commands for your OS, verify the selected JDK:

``` sh
export PATH="$JAVA_HOME/bin:$PATH"
java -version
```

The output should report Java 21 for Capacitor 8, or Java 17 for Cordova. Add
the `JAVA_HOME` and `PATH` exports to `~/.bashrc` or `~/.zshrc` to keep them
in new terminals.

#### Windows

On Windows, install [JDK 21](https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html)
for Capacitor 8, or [JDK 17](https://www.oracle.com/java/technologies/javase/jdk17-archive-downloads.html)
for Cordova.

Ensure the `JAVA_HOME` environment variable is set globally in your system path:

1. Open System Properties: Press Windows Key + Pause/Break or right-click This PC > Properties.
2. Click Advanced system settings.
3. Click the Environment Variables button.
4. Under System Variables, click New.
5. Set Variable Value to the path to your JDK, for example `C:\Program Files\Java\jdk-21`.
6. Click New and add `%JAVA_HOME%\bin`.
7. Click OK to save all changes.

Verify the selected path in PowerShell with `$env:JAVA_HOME`.

Alternatively, you can set the environment variable in a terminal each time you work with a Meteor native app:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
java -version
```

### Android SDK

For Android builds, you need the Android SDK. You can install it via [Android Studio](https://developer.android.com/studio).

Once Android Studio is installed, go to **SDK Manager** and install the SDK
packages required by your integration:

- Capacitor 8 requires Android Studio 2025.2.1+, Android SDK Platform 36, and Build Tools 36.0.0.
- Starting with Meteor 3.5.2, Cordova uses `cordova-android@15.1.0`, which
  requires Android SDK Platform 36 and Build Tools 36.0.0.

Install the `Android SDK Command-line Tools (latest)` as well. Set `ANDROID_HOME`
to the **Android SDK Location** shown in SDK Manager. The default on macOS is:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

On Linux, the default is:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
```

Then expose the SDK tools in your current terminal:

```sh
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
sdkmanager 'platforms;android-36' 'build-tools;36.0.0'
```

Add the exports to `~/.bashrc` or `~/.zshrc` to keep them in new terminals.

#### Windows

Ensure `ANDROID_HOME` environment variable is set globally on the system configuration or by setting the environment variables in the terminal.

``` ps
$env:ANDROID_HOME = "C:\Users\<USER>\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\tools;$env:ANDROID_HOME\tools\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"
```

### Gradle

Capacitor projects include a Gradle wrapper and do not need a global Gradle installation.

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

Run `adb devices` and wait until the emulator is listed as `device` before
running Meteor. With one emulator online, Meteor selects it automatically.

## iOS

For iOS development, you need Xcode. iOS development only works on macOS.

Install [Xcode](https://apps.apple.com/us/app/xcode/id497799835?mt=12) from the App Store.
Capacitor 8 requires Xcode 26 or newer.

After installing, ensure the **command-line tools** are installed:

```sh
xcode-select --install
```

Once the download and installation are finished, accept the license agreement. When you open Xcode for the first time, a dialog will appear with the agreement for you to review and accept. You can then close Xcode. Or use this command:

```sh
sudo xcodebuild -license accept
```

New Capacitor 8 projects use Swift Package Manager. Install CocoaPods for
Cordova or an existing Capacitor project that uses it:

```sh
sudo gem install cocoapods
```

### iOS simulators

Open the Simulator app and wait for a device's Home screen before running Meteor:

```sh
open -a Simulator
```

If no device is available, install an iOS simulator runtime in Xcode first.
