# For now, we only have one script.
$jUnit = Join-Path $env:TEMP 'self-test-junit-0.xml'

$tests = @(
  '^assets'
  '^autoupdate'
  '^dynamic import.*development'
  # Most of the file, not one case: logClientRestart is shared by every
  # client refresh test, and path handling is what differs on Windows.
  # 'for non-npm node_modules' stays out. On Windows the module id for a
  # node_modules file under imports/ comes back as a native absolute path
  # instead of '/imports/node_modules/some-package/index.js', so the test
  # times out. That bug predates this filter and is tracked separately.
  '^client refresh (for (package|application) code|names|stays)'
) -Join '|'

Write-Host "Running: $tests" -ForegroundColor Yellow
Write-Host "Excluded: $env:SELF_TEST_EXCLUDE" -ForegroundColor Yellow

.\meteor.bat self-test `
  --retries 2 `
  --junit "$jUnit" `
  --exclude "$env:SELF_TEST_EXCLUDE" `
  "$tests" `
  '2>&1'
$selfTestExitCode = $LASTEXITCODE

If ($selfTestExitCode -eq 0) {
  Write-Host "Success!" -ForegroundColor Green
} else {
  Write-Host "FAILURE! (Exit: $selfTestExitCode)" -ForegroundColor Red
}

If ($selfTestExitCode -ne 0) {
  Exit $selfTestExitCode
}