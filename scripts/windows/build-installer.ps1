$ErrorActionPreference = "Stop"
$script_path = (split-path -parent $MyInvocation.MyCommand.Definition) + "\"
$conf_path = $script_path + "installer\WiXInstaller\Configuration.wxi"

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
$semverVersion = $version.Split("@")[-1].split("-")[0]
(Get-Content ($conf_path + "_")) | Foreach-Object {
  $_ -replace '__METEOR_RELEASE__',$version `
     -replace '__METEOR_RELEASE_SEMVER__',$semverVersion} | Out-File -Encoding ascii ($conf_path)


$web_client = new-object System.Net.WebClient

# download 7za.exe, a build dependency that we don't want to compile each time
$7za_path = $script_path + "installer\WiXInstaller\Resources\7za.exe"
if (!(Test-Path $7za_path)) {
	echo "Downloading binary dependencies: 7za"
	$7za_url = "https://s3.amazonaws.com/meteor-windows/build-deps/7za.exe"
	$web_client.DownloadFile($7za_url, $7za_path)
}

Push-Location installer
Invoke-Expression ("cmd /c build.bat")
Pop-Location

move-item ($script_path + "installer\Release\InstallMeteor.exe") ($script_path + "InstallMeteor.exe") -Force

echo "Clean up"
rm $conf_path

echo "Done"

