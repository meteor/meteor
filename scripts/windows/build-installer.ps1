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

echo "Building InstallMeteor.exe"

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

if (!(Test-Path $libcurl_path\libcurl)) {
  # Download NuGet
  echo "Downloading NuGet, to be used to download libcurl and dependencies"
  $nuget_path = $script_path + "installer\nuget"
  md -Force $nuget_path
  $web_client.DownloadFile("https://nuget.org/nuget.exe", $nuget_path + "\nuget.exe")

  # Download libcurl and dependencies, then copy them into the WiXHelper project in which they are used
  $libcurl_path = $script_path + "installer\WiXHelper"
  Push-Location $nuget_path
  .\nuget install curl -Version 7.30.0.2
  copy curl.7.30.0.2\build\native\lib\v100\win32\release\static\libcurl.lib $libcurl_path\
  copy libssh2.1.4.3.1\build\native\lib\v100\Win32\Release\static\cdecl\libssh2.lib $libcurl_path\
  copy openssl.1.0.1.21\build\native\lib\v100\Win32\Release\static\cdecl\libeay32.lib $libcurl_path\
  copy openssl.1.0.1.21\build\native\lib\v100\Win32\Release\static\cdecl\ssleay32.lib $libcurl_path\
  copy zlib.1.2.8.1\build\native\lib\v100\Win32\Release\static\cdecl\zlib.lib $libcurl_path\  

  md $libcurl_path\libcurl\
  copy curl.7.30.0.2\build\native\include\curl\*.h $libcurl_path\libcurl\

  Pop-Location
}

Push-Location installer
Invoke-Expression ("cmd /c build.bat")
Pop-Location

move-item ($script_path + "installer\Release\InstallMeteor.exe") ($script_path + "InstallMeteor.exe") -Force

echo "Clean up"
rm $conf_path

echo "Done"

