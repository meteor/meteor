$DIR = "generate-dev-bundle-XXXXXXXX"

New-Item -Type Directory -Name $DIR
Set-Location $DIR

New-Item -Type Directory -Name "build"
Set-Location "build"

### Compile Node
# powershell mistakenly thinks that git throws an error, suppress it
Invoke-Expression "git clone https://github.com/meteor/node.git" 2> out-null
Set-Location "node"
Invoke-Expression "git checkout v0.10.33-with-npm-5821"
cmd.exe /c '.\vcbuild.bat nosign'
Set-Location ..
### Done compiling Node

### Compile Mongo
Invoke-Expression "git clone git://github.com/meteor/mongo.git" 2> out-null
Set-Location "mongo"
Invoke-Expression "git checkout ssl-r2.4.8"
C:\Python27\Scripts\scons mongo.exe mongod.exe --ssl --extrapath=C:\OpenSSL-Win32 -j 2
Set-Location ..
### done compiling Mongo

### Download browserstack local
$browserstack = "browserstack";
New-Item -Type Directory -Name "browserstack"
$url = "https://www.browserstack.com/browserstack-local/BrowserStackLocal-win32.zip"
$file = "$pwd/$browserstack/BrowserStackLocal-win32.zip"
(New-Object System.Net.WebClient).DownloadFile($url,$file)
### Done downloading browserstack local

Set-Location ..
Set-Location ..

# do it twice because once doesn't work lol
# Remove-Item -Force -Recurse $DIR 2> out-null
# Remove-Item -Force -Recurse $DIR