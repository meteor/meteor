# Appveyor already sets $PLATFORM to exactly what we don't want, so
# we'll prepend it with 'windows_' if that seems to be the case.
If ($env:PLATFORM -Match '^x86|x64$') {
  $env:PLATFORM = "windows_${env:PLATFORM}"
}

$dirCheckout = (Get-Item $PSScriptRoot).parent.parent.parent.FullName
$meteorBat = Join-Path $dirCheckout 'meteor.bat'

Write-Host "Resetting git checkout..." -ForegroundColor Magenta
& git.exe -C "$dirCheckout" reset --hard
& git.exe -C "$dirCheckout" submodule foreach --recursive 'git reset --hard'

Write-Host "Updating submodules recursively..." -ForegroundColor Magenta
# Appveyor suggests -q flag for 'git submodule...' https://goo.gl/4TFAHm
& git.exe -C "$dirCheckout" submodule -q update --init --recursive

If ($LASTEXITCODE -ne 0) {
  throw "Updating submodules failed."
}

# The `meteor npm install` subcommand should work
& "$meteorBat" npm install
If ($LASTEXITCODE -ne 0) {
  throw "'meteor npm install' failed."
}

# The `meteor --get-ready` command is susceptible to EPERM errors, so
# we attempt it three times.
$attempt = 3
$success = $false
while ($attempt -gt 0 -and -not $success) {

  Write-Host "Running 'meteor --get-ready'..." -ForegroundColor Magenta
  # By redirecting error to host, we avoid a shocking/false error color,
  # since --get-ready and --version can print (anything) to STDERR and
  # PowerShell will interpret that as something being terribly wrong.
  & "$meteorBat" --get-ready

  If ($LASTEXITCODE -eq 0) {
    $success = $true
  } else {
    $attempt--
  }
}

If ($LASTEXITCODE -ne 0) {
  throw "Running .\meteor --get-ready failed three times."
}
