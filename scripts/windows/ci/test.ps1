# For now, we only have one script.
$jUnit = Join-Path $env:TEMP 'self-test-junit-0.xml'

$tests = @(
  '^assets'
  '^autoupdate'
  '^dynamic import.*development'
  'client refresh for application code'
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
