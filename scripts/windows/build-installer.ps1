$ErrorActionPreference = "Stop"
$script_path = (split-path -parent $MyInvocation.MyCommand.Definition) + "\"

If ($Args.Count -ne 1) {
  echo "Usage:"
  echo "build-installer.ps1 <BOOTSTRAP TARBALL VERSION>"
  echo "Bootstrap tarball version will be compiled into Installer."
  echo ""
  exit 1
}

echo "Compiling InstallMeteor"
echo ("Bootstrap tarball version " + $Args[0])

# Set the version
$version = $Args[0].replace("`n","").replace("`r","")
(Get-Content ($script_path + "InstallMeteor.cs")) | Foreach-Object {$_ -replace '__BOOTSTRAP_VERSION__',$version} | Out-File ($script_path + "InstallMeteor_.cs")

Invoke-Expression ($env:WINDIR + "\Microsoft.NET\Framework\v3.5\csc.exe /out:" + $script_path + "InstallMeteor.exe " + $script_path + "InstallMeteor_.cs /debug /nologo")
echo "Done"

