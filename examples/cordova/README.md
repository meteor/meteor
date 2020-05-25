# Mobile Skeleton

## Motivation
It is very common to create new projects that should be a PWA and also a Native app. Meteor is the perfect fit for these cases as Meteor has built-in integration with Cordova and PWA settings is achieved as in any other platform.

## Web

### Favicon
Create your favicon using a [Favicon Generator](https://www.favicon-generator.org/) and add the `favicon.ico` to your `public` folder.

## Stores
We are going to target Google Play and App Store for explaining how to create your setup there.

## App Store (iOS)

You need to have an Apple developer account to execute the steps below. To build the app you also need a Mac.

### Create App ID and Mobile Provision Profile
- Log into [developer.apple.com](developer.apple.com) using Apple ID associated with developer account
- Main menu > `Account`
- Click on `Certificates, IDs & Profiles`
- Select `Identifiers` > `New` (+)
- Select `App IDs` on `Register a New Identifier` > `Continue`
- Type in the `Description` (the name of your app) and select `Explicit` then fill `Bundle ID` (usually the reverse of your domain, like com.meteor.app).
- Check `Associated Domains` (needed for Universal Links) and `Push Notifications`
- `Continue` to build App ID
- Confirm your App ID and `Register`

### Store Listing
App Store Connect Store Listing:

Log in to https://appstoreconnect.apple.com

- Go to `My Apps`
  - Click the + > `New App`
  - Platforms: iOS
  - App Name: Name of the app
  - Primary Language
  - Choose Bundle ID from dropdown (can take a few minutes to appear)
  - SKU: Enter the site's URL without the protocol (i.e, app.meteor.com)
  - User Access: Full Access
- App Information
  - Name
  - Privacy Policy URL
  - Primary Category
  - Secondary Category
  - Save
- Pricing and Availability
  - Price > Select (Free in most cases)
- 1.0 Prepare for Submission Information
# TODO
  - Skip Upload screen shots
  - Description
  - Keywords: use anything you think a user may search for
  - Support URL
  - Marketing URL (can be your site)
  - Upload icon
  - Age Rating > Edit > select “none” or “no” for all in most cases > Done
  - Version Number: 1.0.0
  - Copyright: your company name 
  - Sign-in Information (if you have private screens):
    - Leave Sign-in required marked
    - Email address: <email>
    - Password: <passoword>
    - Notes: (usually blank)
  - Contact Information:
    - Enter your first name, last name, email address and your phone
    - App store contact information (contact email)
  - Save

### Setup Push for Notifications
We are using in this example One Signal service to send Push Notifications. We don't have any partnership with One Signal, this is just an example.

- Create one account on [https://onesignal.com/](https://onesignal.com/)
- Create a new App
- Name of your app or website
- Select Apple iOS (you can select Android later)
- A popup will open, it will present an upload field and also link to this [documentation](https://documentation.onesignal.com/docs/generate-an-ios-push-certificate) but you can just open [OneSignal's Provisionator Tool](https://onesignal.com/provisionator).
- Generate the mobile provision using [OneSignal's Provisionator Tool](https://onesignal.com/provisionator), just follow the steps with the Apple account that your app is in.
  - Get Started
  - Step 1: Apple ID and Password
  - Allow your Apple ID to connect to this site (and again on every step)
  - Type the verification code > Next
  - Step 2: Select your team (if you have more than one)
  - Step 3: Select your app
  - Copy the password string and download the three files generated in the next step, they will be stored later.
- Return to the popup
  - Upload the .p12 file just downloaded
  - Fill the password just provided
  - Next
  - Native iOS
  - Copy OneSignal App ID because you will use later on `mobile-config.js` to set `oneSignalAppId` variable on your app `case`
  - Save > Leave Setup

## Google Play (Android)

You need to have a Google developer account to execute the steps below.

### Store Listing
- Go to: https://play.google.com/apps/publish
- Click “add new application”
  - Default language
  - Title: App name
  - Click “Prepare Store Listing” 
  - Short Description
  - Description
# TODO
  - Skip Upload screen shots
  - Application type: Applications (usually)
  - Category
  - Save Draft
  - Skip Content rating, you need an APK first 
  - Website: your site url
  - Email: your email address
  - Phone: your phone number
  - Click the save button at the top of the screen
- Go to the “Pricing and Distribution” tab
  - This application is (usually Free)
  - Distribute in these countries (usually all countries)
  - Save Draft
  
### Setup for Push Notifications
- Go to [https://onesignal.com/](https://onesignal.com/) and log in
- Add Android as platform.
  - There is a link for the [documentation](https://documentation.onesignal.com/docs/generate-a-google-server-api-key) to create the keys below. Follow the step by step in this guide.
  - Copy Firebase Server Key and Firebase Sender ID and paste in the OneSignal popup
  - Next
  - Select Native Android
  - Next
  - Copy the App ID (it's the same from iOS if you already did this)
  - Save > Leave Setup
  
## Update config on code
- Go to mobile-config.js
- Edit your app config in the `case` statement with your `App ID`.
  - It'll be like this
  ```javascript
    case 'com.meteorapp.mobile':
      // eslint-disable-next-line no-console
      console.log('--> mobile-config - production build');
      idName = {
        id: 'com.meteorapp.mobile',
        name: 'mobile',
      };
      oneSignalAppId = 'a4a5axxx-59f2-493f-abdb-efce7b0c8ef6';
      urlUniversalLink = 'mobile.meteorapp.com';
      break;
  ```
- Paste your OneSignal App ID `oneSignalAppId`
- Type your app host on `urlUniversalLink`, it's used to open the app directly from a link when the app is installed, you have to omit https:// 
- Also update idName with your id and app name
  
## Prepare to build the new app
- Change the follow variables in your private/native-app/production/build.sh script with your app informations.
  - `env`
  - `appId`
  - `buildFolder`
  - `appName` (If your app has a space anywhere in the name, you must put a backslash before the space, for example: Mobile\ App)
  - `host`
  - `androidVersion` (we will use this version to sign your apps) 
  - `pathToAndroidKeyStore` (keystore location) 
  - `androidPassword` (use the same one generated by OneSignal) 
  
- If you are generating a new version of an existing app increment manually the `version` property on `mobile-config.js` or use a script to do this on every release.
- Save the three files generated by OneSignal in the private folder, also create a password.txt file and paste the password inside it.
# TODO mobile update assets instructions
- Generate your assets (icons and splash screens) using [https://pgicons.abiro.com/](https://pgicons.abiro.com/)
  - Images specifications:
    - Non-transparent PNG's
    - Splash screen image: 2732x2732px
      - Normal logo should be 800x800px sitting in the center
      - Large logo/graphic should at most 1000x2000px
      - In order to be compatible with [App Store](https://developer.apple.com/design/human-interface-guidelines/ios/visual-design/launch-screen/) and [Google Play](https://material.io/design/communication/launch-screen.html#placeholder-ui) policies, the splashcreen image file needs to be at least 2732×2732px JPEG or PNG file.
    - Icon: 1024x1024px
      - In order to be compatible with [App Store](https://developer.apple.com/design/human-interface-guidelines/ios/icons-and-images/app-icon/) and [Google Play](https://developer.android.com/google-play/resources/icon-design-specifications) policies, the icon file needs to be a JPEG or PNG square shape without any alpha channel and minimum 1024x1024px in size. 
  - Check every checkbox except the one after `iOS (legacy)` and `Windows`
  - Background color must be the same as the background of the splash screen
  - Fit type: choose Fill
  - Uncheck `App icon overlay`
- Generate, download and extract.
  - Copy the `res` folder to your `private/assets/` (create `private/assets` if you don't have them yet)
  - Add your original icon file used to generate the assets to `private/assets/` as `icon.png`.
  - Rename /screen/ios/Default@2x~ipad~anyany.png to /screen/ios/Default@2x~universal~anyany.png and delete all the other files in this folder
- You also need to convert your App Icon to Notification Icon, you can use [Android Asset Studio](http://romannurik.github.io/AndroidAssetStudio/icons-notification.html#source.type=clipart&source.clipart=ac_unit&source.space.trim=1&source.space.pad=0&name=ic_stat_onesignal_default)
  - Click on Image
  - Select your App Icon
  - Check if it is being rendered correctly, if not try another image in a different format, check more details [here](https://documentation.onesignal.com/docs/customize-notification-icons)
  - Download the zip and extract
  - Create the folder `cordova-build-override` in the root of your project, this folder will be copied to your Cordova project in the build process
  - Inside this folder create the following directory structure: `platforms/android/app/src/main/` and then copy the content of the zip with the folder (`res`) to `main`. Also name all the images as `ic_stat_onesignal_default.png`. See below how this should look like:
  ![Android Notification Icons directory structure](https://meteor-examples.s3.amazonaws.com/cordova/android-notification-icons.png)
- Commit and push your changes.

## Build your app
- You should do this in a Mac if you are also targeting iOS
- Go to developer.apple.com and create a distribution certificate in the organization account and install this on your Mac
- Open the terminal and run the build script
  ```bash
  cd private
  chmod a+x build.sh
  ./build.sh
  ```
- `XCode` will open automatically when it is done after a few minutes
- The first time will fail to sign your apk because you don't have a keystore yet
  - Generate a keystore
  - Open Android Studio and follow the steps from this [documentation](https://developer.android.com/studio/publish/app-signing#generate-key) to generate a keystore
    - Open the folder inside your build folder: `/android/project/`
    - Main menu > Build > Generate Signed Bundle / APK (if this option is not available wait for Android Studio to index your project)
    - Select APK > Next
    - Key store path > Create new...
    - Key store path, select where you want to save your keystore (the same path used in the script)
    - Password: use the one generated by OneSignal
    - Confirm: same password
    - Alias: your app name in lowercase
    - Password: same password
    - Confirm: same password
    - First and Last Name: Your name without accents
    - Organizational Unit: Development
    - Organization: your company
    - City or Locality: your city
    - State or Province: your state
    - Country Code (XX): your country
    - OK
  - You don't need to finish the steps, now you can already run build.sh again and it's going to sign your APK for you.
  - Don't forget to save your keystore in a safe location, otherwise you won't be able to update your app later.

## Publishing the apps
### iOS
- On `XCode` (if you need to open it again you should open using this file `build-folder/ios/project/YOURAPP.xcworkspace`)
- In the right side of the play/stop buttons -> select `Generic iOS Device` as target
  - Go to menu Product > `Archive`
  - If you have any errors click in the Project on the left side and go to Signing & Capabilities tab because probably you need to select your Team to sign the app.
- Archives pop-up will open after a few seconds
  - Select the version that you just build and click on the blue button on the right `Distribute App`
- Distribution pop-up will open
  - Keep iOS App Store selected and click on `Next`
  - Keep Upload selected and click on `Next`
  - Keep Strip Swift symbols and Upload your app's... checked and click on `Next`
  - Keep Automatically manage signing selected and click on `Next`
  - Click on `Upload` and wait a few minutes until you see a Success message
- Go to App Store Connect website to publish on TestFlight
  - On iOS Builds you need to wait for your version to be ready to submit, it will stay a few minutes in the `Processing` (with a yellow indicator) status. 
    - You need to refresh the page to see updates. You are also going to receive an email when your app is processed (like this `App Store Connect: Version 1.0.17 (11700) for YourAppName has completed processing`).
  - After processing the status will be `Missing Compliance` with a `yellow warning icon` -> click on this icon -> a popover will open -> click on the link `Provide Export Compliance Information.` 
    - Export Complaince Information pop-up will open, select `No` and then click on `Start Internal Testing`
  - The status will change to `Testing` (with a green indicator) and it means our app is ready to be tested using TestFlight.

#### Known Issues
- In the final process of `Distribute App` you may get an error with the certificate, the reason could be that we have reached the limit of "iOS Distribution" kind of certificates. You can fix this by revoking an unused one on the Apple developer account panel.
  
### Android
#### First time
- Publishing your first APK
  - Go to https://play.google.com/apps/publish
  - Select your app
  - Versions
  - Production > Manage > New Version
  - Upload your signed APK
  - What is new: add your release notes
  - Save
  - Review
- Now you can finish your setup as you have an APK
  - Content rating
    - Continue
    - Your email
    - Select your app category
    - Answer the questions
    - Save
    - Calculate
    - Apply
  - Pricing and Distribution
    - Usually you leave remaining boxes on this screen blank except for (Content guidelines * and US export laws *), of course you need to check the details for your app
    - Save
  
# Updating existent app
## TODO
Explain how to use Fastlane and build script

# TODO Review
## How it is implemented

The implementation here is not the simplest one, the idea here is to provide insights on how to configure PWA and Native settings on-the-fly when possible or in the build time. This is done to enable developers to generate multiple PWA and Native apps using the same code and backend but providing different look-and-feel for different clients.

# TODO Review
## What is included
- PWA
  - manifest
  - service worker
- Meta tags including opengraph
- Cordova configuration
- Apple Universal link configuration
- Google Analytics

## How to use it

### Replace default values
#### Pending
Document all the places that the developer needs to change.

Look for `replace cordova-example` in the code and replace with your values. 
