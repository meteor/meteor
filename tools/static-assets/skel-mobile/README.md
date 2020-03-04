# Mobile Skeleton

## Motivation
It is very common to create new projects that should be a PWA and also a Native app. Meteor is the perfect fit for these cases as Meteor has built-in integration with Cordova and PWA settings is achieved as in any other platform.

## Stores
We are going to target Google Play and App Store for explaining how to create your setup there.

## App Store (iOS)

You need to have an Apple developer account to execute the steps below. To build the app you also need a Mac.

### Create App ID and Mobile Provision Profile
- Log into [developer.apple.com](developer.apple.com) using Apple ID associated with developer account
- Click on Certificates, Identifiers, and Profiles
- Select Identifiers > App Ids > +
- Type in the `Name` and the `Bundle ID` (usually the reverse of your domain, like com.meteor.app).
- Check `Push Notifications` and `Associated Domains` (needed for Universal Links)
- Continue to build App ID

### Store Listing
App Store Connect Store Listing:

Log in to https://appstoreconnect.apple.com

- Go to My Apps
  - Click the + > New App
  - App Name: Name of the app
  - Language
  - Choose Bundle ID from dropdown (can take a few minutes to appear)
  - SKU: Enter the site’s URL without the domain (i.e, app.meteor.com)
- App Information
  - Privacy Policy URL
  - Primary Category
  - Secondary Category
- Pricing and Availability
  - Price > Select (Free in most cases)
- 1.0 Prepare for Submission Information
  - Upload screen shots
  - Description
  - Keywords: use anything you think a user may search for
  - Support URL
  - Marketing URL (can be your site)
  - Upload icon
  - Ratings: select “none” or “no” for all
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

### Setup Push for Notifications
We are using in this example One Signal service to send Push Notifications. We don't have any partnership with One Signal, this is just an example.

- Create one account on [https://onesignal.com/](https://onesignal.com/)
- Copy the password string and download the three files generated in the next step, they will be stored later.
- Generate the mobile provision using [OneSignal's Provisionator Tool](https://onesignal.com/provisionator), just follow the steps with the Apple account that your app is in.
- Go to [https://onesignal.com/](https://onesignal.com/) and log in
  - Create a new app
  - Go to Settings
  - Add Apple (iOS) as platform and set
    - Upload the .p12 file just downloaded
    - Fill the password just provided
- Copy OneSignal App ID because you will use later on `mobile-config.js` to set `oneSignalAppId` variable on your app `case`

## Google Play (Android)

You need to have a Google developer account to execute the steps below.

### Store Listing
- Go to: https://play.google.com/apps/publish
- Click “add new application”
  - Default language
  - Title: Enter short title
  - Click “Prepare Store Listing” 
  - Description
  - Promo text
  - Application type: Applications
  - Category
  - Content rating
  - Website: your site url
  - Email: your email address
  - Privacy Policy URL
  - Click the save button at the top of the screen
- Go to the “Pricing and Distribution” tab
  - This application is (usually Free)
  - Distribute in these countries (usually all countries)
  - Usually you leave remaining boxes on this screen blank except for (Content guidelines * and US export laws *), of course you need to check the details for your app
  - Click the save button at the top of the screen
  
### Setup for Push Notifications
- Go to [https://onesignal.com/](https://onesignal.com/) and log in
# TODO mobile check how to create firebase server key and sender id
- Add Android as platform and set:
  - Firebase Server Key: xxxxxxxx:APA91bHNkgaOjpqvcjpBzrf4FiFbOC2paPtbV_0mRVAD65Dc4Z1IwnMI2GQS_cctLIvnakzt0tmV8QFpNii3M7761bKTqAQaoToOorePgmRB1XfD0YiGzbkvyoaqvjd6m5CJlotHu9LajktfwUdsI-j2P80r_f3heg
  - Firebase Sender ID: 112871635283
  
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
  
## Prepare to build the new app
- Change the follow variables in your private/build.sh script with your app informations.
  - `buildFolder`
  - `appId`
  - `appName` (If your app has a space anywhere in the name, you must put a backslash before the space, for example: Mobile\ App)
- If you are generating a new version of an existing app increment manually the `version` property on `mobile-config.js`.
- Save the three files generated by OneSignal in the private folder, also create a password.txt file and paste the password inside it.
# TODO mobile update assets instructions
- Generate your assets (icons and splash screens) using [https://pgicons.abiro.com/](https://pgicons.abiro.com/)
  - Images specifications:
    - Non-transparent PNG's
    - Splash screen image: 2732x2732px
      - normal logo should be 800x800px sitting in the center
      - large logo/graphic should at most 1000x2000px
    - Icon: 1024x1024px
  - Check every checkbox except the one after `iOS (legacy)` and `Windows`
  - Background color must be the same as the background of the splash screen
  - Fit type: choose Fill
  - Uncheck `App icon overlay`
- Download and extract them on `/Users/admin/ws/` (this is the `ws` in the home of our admin user). Rename the folder to `pathable-build-copathablehealthemotions-assets`. Replace `copathablehealthemotions` with your App ID omitting the dots.
  - Replace icon.png with the original icon used to generate the assets
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

## Publishing the apps
### iOS
- On `XCode` (if you need to open it again you should open using this file `build-folder/ios/project/YOURAPP.xcworkspace`)
# TODO mobile review what steps we still need
- Go to menu File > `Workspace Settings...`
  - Build System -> and select `Legacy Build System` -> Done ([read more](https://github.com/apache/cordova-ios/issues/412#issuecomment-424153531))
- Click on `App Name` on Project Navigator (left side) to see the project settings
  - Go to the tab `General` 
    - Go to `Signing` section -> `Team` -> and select your team.
  - Go to the tab `Capabilities` section -> and enable `Push Notifications`
    - Fixes `Missing Push Notification Entitlement` error
  - Go to the tab `Build Setting` 
    - Go to `Signing` section -> `Code Signing Identity` -> `Release` -> and select `iOS Developer`
    - Go to `Swift Language Version` section -> and select `Swift 4.2`
- Inside `App Name` on Project Navigator (left side) -> Resources -> click on `App Name`-info.plist  
  - Add a key under `App Transport Security Settings` called `Allow Arbitrary Loads` with value `YES`
    - Fixes external links without HTTPS
- In the right side of the play/stop buttons -> select `Generic iOS Device` as target
  - Go to menu Product > `Archive`
- Archives pop-up will open after a few seconds
  - Select the version that you just build and click on the blue button on the right `Distribute App`
- Distribution pop-up will open
  - Keep iOS App Store selected and click on `Next`
  - Keep Upload selected and click on `Next`
  - Keep Strip Swift symbols and Upload your app's... checked and click on `Next`
  - Keep Automatically manage signing selected and click on `Next`
  - Click on `Upload` and wait a few minutes until you see a Success message
- Go to App Store Connect website to publish on TestFlight ([Staging direct link](https://appstoreconnect.apple.com/WebObjects/iTunesConnect.woa/ra/ng/app/1420469087/testflight?section=iosbuilds) and [Production direct link](https://appstoreconnect.apple.com/WebObjects/iTunesConnect.woa/ra/ng/app/1392609782/testflight?section=iosbuilds))
  - On iOS Builds you need to wait for your version to be ready to submit, it will stay a few minutes in the `Processing` (with a yellow indicator) status. 
    - You need to refresh the page to see updates. You are also going to receive an email when your app is processed (like this `App Store Connect: Version 1.0.17 (11700) for vNextStaging has completed processing`).
  - After processing the status will be `Missing Compliance` with a `yellow warning icon` -> click on this icon -> a popover will open -> click on the link `Provide Export Compliance Information.` 
    - Export Complaince Information pop-up will open, select `No` and then click on `Start Internal Testing`
  - The status will change to `Testing` (with a green indicator) and it means our app is ready to be tested using TestFlight.

#### Known Issues

- In the final process of `Distribute App` you may get an error with the certificate, the reason could be that we have reached the limit of "iOS Distribution" kind of certificates. You can fix this by revoking an unused one on the Apple developer account panel, check [here](https://monosnap.com/file/Q9Pyx1mrTvV7eum1BA9KlVPwmXFy6F).
  
### Android
- Open the project on Android Studio, you need to select this folder `/Users/admin/ws/build-copathablehealthemotions/android/project`
- First we need to sign our APK `Generate a key and keystore` ([more info](https://developer.android.com/studio/publish/app-signing))
  - Wait Android Studio index the project
  - In the main menu click on `Build` > `Generate Signed Bundle / APK`
    - Select `APK` > Next
    - If you are signing in this app for the first time click `Create new...`:
      - Fill the fields:
        - `Key store path`: `/Users/admin/ws/pathable-next/pathable-app/private/native-app/copathablehealthemotions`
        - `Password`: use the one generated by OneSignal (it's saved on `/Users/admin/ws/pathable-next/pathable-app/private/native-app/copathablehealthemotions/password.txt`)
        - `Confirm`: same password
        - `Alias`: `copathablehealthemotions`
        - `Password`: same password
        - `Confirm`: same password
        - `First and Last Name`: Your name without accents
        - `Organizational Unit`: Development
        - `Organization`: Pathable
        - `City or Locality`: Seattle
        - `State or Province`: WA
        - `Country Code (XX)`: US
      - Commit and push your changes. It's important because we need to save the Key Store file and password or we will lose the ability to update this app later. If you don't have permission ask for the vNext dev team
        - Open the terminal and run the build script
          ```bash
          cd /Users/admin/ws/pathable-next//
          git checkout master
          git pull
          git add .
          git commit -m "adding android key store file"
          git push
          ```
        - Go to [Github repository](https://github.com/pathable/pathable-next) and make sure the file is there on master
      - Next
    - If is not the first time:
      - Click on `Choose existing...` and select the file inside `/Users/admin/ws/pathable-next/pathable-app/private/native-app/copathablehealthemotions` folder that represents the Key Store
      - `Key store password`: (it's saved on `/Users/admin/ws/pathable-next/pathable-app/private/native-app/copathablehealthemotions/password.txt`)
      - `Key alias`: select the only one available
      - `Key password`: same password
      - Next
    - On `Signature Versions` check both `V1 (Jar Signature)` and `V2 (Full APK Signature)`
    - Finish
    - A popover will show up with a link named `locate`
    - Will open Finder in a folder (`/Users/admin/ws/build-copathablehealthemotions/android/project/release`) with `project-release.apk` inside it
    - Upload this APK to Google Play

## Set Native on your community dashboard
- On vNext website Admin of your community
- Go to Settings > Native App
  - Fill all the fields, read the help texts to understand each one
  
# Updating existent app
- On GitHub Increment manually the `version` and `buildNumber` properties on [`mobile-config.js`](https://github.com/pathable/pathable-next/blob/master/pathable-app/mobile-config.js)
- On MacInCloud
  - Update the code
    ```
    cd /Users/admin/ws/pathable-next/
    git reset --hard
    git checkout master
    git pull
    ```
  - Build the app using the script created in the first submission
    ```
    cd /Users/admin/ws/pathable-next/pathable-app/private/native-app/
    ./build-copathablehealthemotions.sh
    ```
  - Follow the same steps from the first time on XCode and Android Studio after the build is completed.


## How it is implemented

The implementation here is not the simplest one, the idea here is to provide insights on how to configure PWA and Native settings on-the-fly when possible or in the build time. This is done to enable developers to generate multiple PWA and Native apps using the same code and backend but providing different look-and-feel for different clients.

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
Look for `replace skel-mobile` in the code and replace with your values. 