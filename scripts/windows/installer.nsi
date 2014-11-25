; Install Meteor Windows Port

!include LogicLib.nsh
!include ZipDLL.nsh

OutFile "InstallMeteor.exe"
; default section
Section

  Var /Global tarball_file
  ; Edit this string to change the used tarball
  StrCpy $tarball_file "meteor-bootstrap-os.windows.x86_32-0.0.6.zip"


  ; set the install location to localappdata or appdata
  ${If} $LOCALAPPDATA == ''
    SetOutPath $APPDATA
  ${Else}
    SetOutPath $LOCALAPPDATA
  ${EndIf}

  ; location where to put warehouse
  Var /Global warehouse
  StrCpy $warehouse "$OUTDIR\.meteor\"

  ; figure out the bootstrap tarball url
  Var /Global tarball_url
  ;StrCpy $tarball_url "https://warehouse.meteor.com/windows/bootstrap/$tarball_file"
  StrCpy $tarball_url "https://s3.amazonaws.com/com-meteor-stars-slava-test/meteor-bootstrap-os.windows.x86_32-0.0.6.zip"

  ; copy files in 3 steps:
  ; 1. Download the tarball
  NSISdl::download $tarball_url "$TEMP\$tarball_file"

  ; 2. Extract the tarball to location
  ; Unzip $TEMP\$tarball_file into warehouse directory
  ; !insertmacro ZIPDLL_EXTRACT "$TEMP\$tarball_file" "$warehouse" "<ALL>"
  ;untgz::extract "-j" "-d" "$OUTDIR" "$TEMP\$tarball_file"
  !insertmacro ZIPDLL_EXTRACT "c$TEMP\$tarball_file" "$OUTDIR" "<ALL>"
  StrCmp $0 "success" +4
  DetailPrint "  Failed to extract ${DICT_FILENAME}"
  MessageBox MB_OK|MB_ICONEXCLAMATION|MB_DEFBUTTON1 "  Failed to extract $tarball_file"
  Abort
	 
  ; 3. Delete temporary files
  Delete "$TEMP\$tarball_file"

SectionEnd
