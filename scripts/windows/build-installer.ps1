$ErrorActionPreference = "Stop"
$script_path = (split-path -parent $MyInvocation.MyCommand.Definition) + "\"
$conf_path = $script_path + "wix-installer\WiXInstaller\Configuration.wxi"

If ($Args.Count -ne 1) {
  echo "Usage:"
  echo "build-installer.ps1 <METEOR RELEASE>"
  echo "The bootstrap tarball url will be compiled into the installer binary based on the Meteor release string."
  echo ""
  exit 1
}

echo "Compiling InstallMeteor"
echo ("Bootstrap tarball version " + $Args[0])

# Set the version
$version = $Args[0].replace("`n","").replace("`r","")
# Numeric part of version, like 1.2.3.4
$semverVersion = $version.Split("@")[-1]
(Get-Content ($conf_path + "_")) | Foreach-Object {
  $_ -replace '__METEOR_RELEASE__',$version `
     -replace '__METEOR_RELEASE_SEMVER__',$semverVersion} | Out-File -Encoding ascii ($conf_path)

# download 7za.exe, build dependency that we don't want to build from scratch
echo "Downloading binary dependencies: 7za"
$7za_url = "https://s3.amazonaws.com/meteor-windows/build-deps/7za.exe"
$client = new-object System.Net.WebClient
$client.DownloadFile($7za_url, $script_path + "wix-installer\WiXInstaller\Resources\7za.exe")

Push-Location wix-installer
Invoke-Expression ("cmd /c build.bat")
Pop-Location

move-item ($script_path + "wix-installer\Release\Setup_Meteor.exe") ($script_path + "InstallMeteor.exe")

echo "Clean up"
rm $conf_path

echo "Done"

