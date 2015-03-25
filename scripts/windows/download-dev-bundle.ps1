# XXX right now we only build 32-bit dev_bundles
$PLATFORM = "windows_x86"

$windows_scripts = split-path -parent $MyInvocation.MyCommand.Definition
$scripts_path = split-path -parent $windows_scripts
$CHECKOUT_DIR = split-path -parent $scripts_path

# extract the bundle version from the meteor bash script
$BUNDLE_VERSION = select-string -Path ($CHECKOUT_DIR + "\meteor") -Pattern 'BUNDLE_VERSION=(\S+)'  | % { $_.Matches[0].Groups[1].Value } | select-object -First 1
$BUNDLE_VERSION = $BUNDLE_VERSION.Trim()

echo "Will get you a dev_bundle for $PLATFORM version $BUNDLE_VERSION"

$TARBALL="dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz"

echo "Going to download the dependency kit from the Internet"
$ErrorActionPreference = "Stop"

# duplicated in top-level meteor script:
$DEV_BUNDLE_URL_ROOT="https://d3sqy0vbqsdhku.cloudfront.net/"
# If you set $USE_TEST_DEV_BUNDLE_SERVER then we will download
# dev bundles copied by copy-dev-bundle-from-jenkins.sh without --prod.
# It still only does this if the version number has changed
# (setting it won't cause it to automatically delete a prod dev bundle).
if ("$env:USE_TEST_DEV_BUNDLE_SERVER" -ne "") {
    $DEV_BUNDLE_URL_ROOT="https://s3.amazonaws.com/com.meteor.static/test/"
}

$devbundle_link = $DEV_BUNDLE_URL_ROOT + $TARBALL
$devbundle_zip = $CHECKOUT_DIR + "\" + $TARBALL

$webclient = New-Object System.Net.WebClient
$webclient.DownloadFile($devbundle_link, $devbundle_zip)

echo "... downloaded"

cmd /C "7z.exe x $devbundle_zip -so | 7z.exe x -aoa -si -ttar -o$CHECKOUT_DIR\dev_bundle_XXX" | out-null

$downloaded_tmp = $CHECKOUT_DIR + "\dev_bundle_XXX"
$downloaded_path = $downloaded_tmp + "\dev_bundle_" + $PLATFORM + "_" + $BUNDLE_VERSION
$target_path = $CHECKOUT_DIR + "\dev_bundle"
Move-Item  $downloaded_path $target_path

Remove-Item -Recurse -Force $downloaded_tmp
Remove-Item -Force $devbundle_zip

