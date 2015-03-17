REM Find the top of the tools tree (not to be confused with the 'tools'
REM directory in that tree)
set TOOLS_DIR="%~dp0\..\..\.."

REM Find our binary dependencies (node).
set DEV_BUNDLE="%TOOLS_DIR%\dev_bundle"

REM Have at it!
set NODE_PATH="%DEV_BUNDLE%\lib\node_modules"
"%DEV_BUNDLE%\bin\node" "%~dp0\fake-mongod.js" %*