$ErrorActionPreference = "Stop"
$script_path = (split-path -parent $MyInvocation.MyCommand.Definition) + "\"

echo "Compiling InstallMeteor"

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

echo "Done"

