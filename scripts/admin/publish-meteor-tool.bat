REM This file is copied line by line by the publish-meteor-tool-on-arch.sh script
REM Since it is copied via separate ssh commands, all special symbols here are
REM escaped with the carat ("^")
REM This script usually runs only on a build farm Windows machines, this is why
REM it has some assumptions about having executables on certain paths

REM nuke the working directory
IF EXIST C:\tmp ( rmdir /s /q C:\tmp )

md C:\tmp
cd C:\tmp

REM get the meteor/meteor repo
C:\git\bin\git.exe clone https://github.com/meteor/meteor.git
cd meteor
REM force git to use original end-line characters (unixy '\n')
C:\git\bin\git.exe config --replace-all core.autocrlf input
C:\git\bin\git.exe rm --cached -r . ^> nul
C:\git\bin\git.exe reset --hard
C:\git\bin\git.exe fetch --tags
REM GITSHA is replaced by the script transferring this file
C:\git\bin\git.exe checkout $GITSHA

REM install 7-zip, required for running meteor from checkout
C:\git\bin\curl -L http://downloads.sourceforge.net/sevenzip/7z920.msi ^> C:\7z.msi
msiexec /i C:\7z.msi /quiet /qn /norestart
set PATH=^%PATH^%;"C:\Program Files\7-Zip"
REM wait 3 seconds to avoid races with the 7-zip installation
ping -n 4 127.0.0.1 ^> nul

REM run meteor and publish the release
powershell "Set-ExecutionPolicy ByPass"
.\meteor.bat --help ^> nul 2^>^&^1 || echo "First npm failure is expected"
cd C:\tmp\meteor\packages\meteor-tool
REM we expect that the meteor-session file is transferred before-hand by
REM publish-meteor-tool-on-arch.sh
set METEOR_SESSION_FILE=C:\meteor-session
REM in case of failure, print the log of the operation
..\..\meteor.bat publish --existing-version

