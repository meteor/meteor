
<#
  .Synopsis
  Get the architecture for the Meteor Dev Bundle

  .Description
  Determine the architecture (64-bit/32-bit) from the environment,
  taking into consideration the PLATFORM override environment variable,
  which is used by Jenkins when building the dev bundle for Windows.

  Otherwise, use logic similar to that of Chocolatey's
  Get-OSArchitectureWidth method, as seen here: https://git.io/vd2e9
#>
Function Get-MeteorPlatform {
  if (Test-Path env:PLATFORM) {
    $PLATFORM = (Get-Item env:PLATFORM).Value
  } elseif (([System.IntPtr]::Size -eq 4) -and (Test-Path env:\PROCESSOR_ARCHITEW6432)) {
    $PLATFORM = "windows_x64"
  } elseif ([System.IntPtr]::Size -eq 4) {
    $PLATFORM = "windows_x86"
  } else {
    $PLATFORM = "windows_x64"
  }
  $PLATFORM
}

export-modulemember -function Get-MeteorPlatform