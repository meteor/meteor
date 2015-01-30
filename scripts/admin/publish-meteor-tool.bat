REM This file is copied line by line by the publish-meteor-tool-on-arch.sh script
IF EXIST C:\tmp ( rmdir /s /q C:\tmp )
md C:\tmp
cd C:\tmp
C:\git\bin\git.exe clone https://github.com/meteor/meteor.git
cd meteor
C:\git\bin\git.exe config --replace-all core.autocrlf input
C:\git\bin\git.exe rm --cached -r . ^> nul
C:\git\bin\git.exe reset --hard
C:\git\bin\git.exe fetch --tags
C:\git\bin\git.exe checkout $GITSHA
C:\git\bin\curl -L http://downloads.sourceforge.net/sevenzip/7z920.msi ^> C:\7z.msi
msiexec /i C:\7z.msi /quiet /qn /norestart
set PATH=^%PATH^%;"C:\Program Files\7-Zip"
ping -n 4 127.0.0.1 ^> nul
powershell "Set-ExecutionPolicy ByPass"
.\meteor.bat --help ^> nul 2^>^&^1 || echo "First npm failure is expected"
cd C:\tmp\meteor\packages\meteor-tool
set METEOR_SESSION_FILE=C:\meteor-session
..\..\meteor.bat publish --existing-version
