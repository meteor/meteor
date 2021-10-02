$windows_scripts = split-path -parent $MyInvocation.MyCommand.Definition
$scripts_path = split-path -parent $windows_scripts
$CHECKOUT_DIR = split-path -parent $scripts_path

# extract the bundle version from the meteor bash script
$BUNDLE_VERSION = select-string -Path ($CHECKOUT_DIR + "\meteor") -Pattern 'BUNDLE_VERSION=(\S+)'  | % { $_.Matches[0].Groups[1].Value } | select-object -First 1
$BUNDLE_VERSION = $BUNDLE_VERSION.Trim()

# extract the bundle version we have on FS
$CURRENT_VERSION = select-string -Path ($CHECKOUT_DIR + "\dev_bundle\.bundle_version.txt") -Pattern '(.*)' | % { $_.Matches[0].Captures[0].Value } | select-object -First 1

If ($CURRENT_VERSION -eq $BUNDLE_VERSION) {
  exit 0
}

# fail
exit 1

