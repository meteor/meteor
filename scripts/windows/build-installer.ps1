$ErrorActionPreference = "Stop"

If ($Args.Count -ne 2) {
  echo "Usage:"
  echo $Args[0] + " <BOOTSTRAP TARBALL VERSION>"
  echo "Bootstrap tarball version will be compiled into Installer."
  echo ""
  exit 1
}

echo "Compiling InstallMeteor"
echo "Bootstrap tarball version " + $Args[1]

# Set the version
(Get-Content InstallMeteor.cs) | Foreach-Object {$_ -replace '\[__BOOTSTRAP_VERSION__\]', $Args[1]} | Out-File InstallMeteor.cs

Invoke-Expression $WINDIR + "Microsoft.NET\Framework\v3.5\csc.exe InstallMeteor.cs /debug /nologo"
echo "Done"

