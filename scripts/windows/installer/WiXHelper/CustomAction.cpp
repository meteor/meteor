#include "stdafx.h"


#include <string>

#include <wcautil.h>
#include <strutil.h>

#include <pathutil.h>
#include <fileutil.h>
#include <dirutil.h>

#include <urlmon.h>
#include <winhttp.h>
#include <sys/stat.h>

#define BUF_LEN 1024
#define MAX_LONG_PATH 2048
#define LOG true



    




using namespace std;

class MyCallback : public IBindStatusCallback  
{
public:
	MSIHANDLE iHInstall;
    MyCallback() {}

    ~MyCallback() { }

    // This one is called by URLDownloadToFile
    STDMETHOD(OnProgress)(/* [in] */ ULONG ulProgress, /* [in] */ ULONG ulProgressMax, /* [in] */ ULONG ulStatusCode, /* [in] */ LPCWSTR wszStatusText)
    {
		PMSIHANDLE hActionRec = MsiCreateRecord(3);
        PMSIHANDLE hProgressRec = MsiCreateRecord(3);

		DWORD ulPrc = 0;
		WCHAR wzInfo[1024] = { };

		if (ulProgressMax > 0) 
		{
			ulPrc  = static_cast<DWORD>(100 * static_cast<double>(ulProgress) / static_cast<double>(ulProgressMax));
			::StringCchPrintfW(wzInfo, countof(wzInfo), L"Downloading Meteor...  %u%%", ulPrc);
		}
		else
			::StringCchPrintfW(wzInfo, countof(wzInfo), L"Downloading Meteor...");


 
        MsiRecordSetString(hActionRec, 1, TEXT("Download_MeteorPackage"));
        MsiRecordSetString(hActionRec, 2, wzInfo);
        MsiRecordSetString(hActionRec, 3, NULL);
        UINT iResult = MsiProcessMessage(iHInstall, INSTALLMESSAGE_ACTIONSTART, hActionRec);
        if ((iResult == IDCANCEL) || (iResult == IDABORT))
            return E_ABORT;

        return S_OK;
    }

    // The rest  don't do anything...
    STDMETHOD(OnStartBinding)(/* [in] */ DWORD dwReserved, /* [in] */ IBinding __RPC_FAR *pib)
    { return E_NOTIMPL; }

    STDMETHOD(GetPriority)(/* [out] */ LONG __RPC_FAR *pnPriority)
    { return E_NOTIMPL; }

    STDMETHOD(OnLowResource)(/* [in] */ DWORD reserved)
    { return E_NOTIMPL; }

    STDMETHOD(OnStopBinding)(/* [in] */ HRESULT hresult, /* [unique][in] */ LPCWSTR szError)
    { return E_NOTIMPL; }

    STDMETHOD(GetBindInfo)(/* [out] */ DWORD __RPC_FAR *grfBINDF, /* [unique][out][in] */ BINDINFO __RPC_FAR *pbindinfo)
    { return E_NOTIMPL; }

    STDMETHOD(OnDataAvailable)(/* [in] */ DWORD grfBSCF, /* [in] */ DWORD dwSize, /* [in] */ FORMATETC __RPC_FAR *pformatetc, /* [in] */ STGMEDIUM __RPC_FAR *pstgmed)
    { return E_NOTIMPL; }

    STDMETHOD(OnObjectAvailable)(/* [in] */ REFIID riid, /* [iid_is][in] */ IUnknown __RPC_FAR *punk)
    { return E_NOTIMPL; }

	// IUnknown stuff
    STDMETHOD_(ULONG,AddRef)()
    { return 0; }

    STDMETHOD_(ULONG,Release)()
    { return 0; }

    STDMETHOD(QueryInterface)(/* [in] */ REFIID riid, /* [iid_is][out] */ void __RPC_FAR *__RPC_FAR *ppvObject)
    { return E_NOTIMPL; }
};





HRESULT ExtractBinary(
	__in LPCWSTR wzBinaryId,
	__out BYTE** pbData,
	__out DWORD* pcbData
	)
{
	HRESULT hr = S_OK;
	LPWSTR pwzSql = NULL;
	PMSIHANDLE hView;
	PMSIHANDLE hRec;

	// make sure we're not horked from the get-go
	hr = WcaTableExists(L"Binary");
	if (S_OK != hr)
	{
		if (SUCCEEDED(hr))
		{
			hr = E_UNEXPECTED;
		}
		ExitOnFailure(hr, "There is no Binary table.");
	}

	ExitOnNull(wzBinaryId, hr, E_INVALIDARG, "Binary ID cannot be null");
	ExitOnNull(*wzBinaryId, hr, E_INVALIDARG, "Binary ID cannot be empty string");

	hr = StrAllocFormatted(&pwzSql, L"SELECT `Data` FROM `Binary` WHERE `Name`=\'%s\'", wzBinaryId);
	ExitOnFailure(hr, "Failed to allocate Binary table query.");

	hr = WcaOpenExecuteView(pwzSql, &hView);
	ExitOnFailure(hr, "Failed to open view on Binary table");

	hr = WcaFetchSingleRecord(hView, &hRec);
	ExitOnFailure(hr, "Failed to retrieve request from Binary table");

	hr = WcaGetRecordStream(hRec, 1, pbData, pcbData);
	ExitOnFailure(hr, "Failed to read Binary.Data.");

LExit:
	ReleaseStr(pwzSql);
	return hr;
}


HRESULT ExtractBinaryToFile(
	__in LPCWSTR wzBinaryId,
	__in LPCWSTR wzFilePath
	)
{
	HRESULT hr = S_OK;
	BYTE* pbData = NULL;
	DWORD cbData = 0;
	DWORD cbWritten = 0;

	HANDLE hFile = INVALID_HANDLE_VALUE;

	wchar_t szTmpFile[BUF_LEN] = L"";	DWORD nTmpFileLen = BUF_LEN;
	hr = ExtractBinary(wzBinaryId, &pbData, &cbData);

	hFile = CreateFile(wzFilePath, GENERIC_WRITE,FILE_SHARE_WRITE, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
	if (hFile != INVALID_HANDLE_VALUE) {
		WriteFile(hFile, pbData, cbData, &cbWritten, NULL);
		CloseHandle(hFile);
	}
	else
	{
		hr = HRESULT_FROM_WIN32(::GetLastError());
	}

	return hr;
}




BOOL ExecuteCommandLine(LPWSTR CommandLine, DWORD & exitCode)
{
	PROCESS_INFORMATION processInformation = {0};
	STARTUPINFO startupInfo                = {0};
	startupInfo.cb                         = sizeof(startupInfo);

	// Create the process
	BOOL result = CreateProcess(NULL, CommandLine, 
		NULL, NULL, FALSE, 
		NORMAL_PRIORITY_CLASS | CREATE_NO_WINDOW, 
		NULL, NULL, &startupInfo, &processInformation);

	if (!result)
	{
		// CreateProcess() failed;   Get the error from the system
		LPVOID lpMsgBuf;
		DWORD dw = GetLastError();
		FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, 
			NULL, dw, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR) &lpMsgBuf, 0, NULL);

		// Display the error
		LPTSTR strError = (LPTSTR) lpMsgBuf;

		// Free resources created by the system
		LocalFree(lpMsgBuf);

		// We failed.
		return FALSE;
	}
	else
	{
		// Successfully created the process.  Wait for it to finish.
		WaitForSingleObject( processInformation.hProcess, INFINITE );

		// Get the exit code.
		result = GetExitCodeProcess(processInformation.hProcess, &exitCode);

		// Close the handles.
		CloseHandle( processInformation.hProcess );
		CloseHandle( processInformation.hThread );

		if (!result) {
			return FALSE;
		} else {
			// We succeeded.
			return TRUE;
		}
	}
}


HRESULT UnzipToFolder(
	MSIHANDLE hInstall,
	__in LPCWSTR wzFriendlyName,
	__in LPCWSTR wzTarGzFileName,
	__in LPCWSTR wzDestPath
	)
{
	HRESULT hr = S_OK;

	WcaLog(LOGMSG_STANDARD, "Extract \"%S\" package initialized.", wzFriendlyName);

	wchar_t szSourceDir[BUF_LEN] = L"";	DWORD nSourceDirDirLen = BUF_LEN;
	wchar_t szTarGzFilePath[BUF_LEN] = L"";
	wchar_t szTarFilePath[BUF_LEN] = L"";
	MsiGetProperty(hInstall, L"SourceDir", szSourceDir, &nSourceDirDirLen);
	StringCchPrintf(szTarGzFilePath, BUF_LEN, L"%s%s", szSourceDir, wzTarGzFileName);
	StringCchPrintf(szTarFilePath, BUF_LEN, L"%s*.tar", szSourceDir);

	//Extacting quality_cloud_production.sql to %TEMP% folder
	wchar_t szTmpDir[BUF_LEN] = L"";		DWORD nTmpDirLen = BUF_LEN;
	wchar_t sz7Zip[BUF_LEN] = L"";
	wchar_t packedTarball[BUF_LEN] = L"";

	wchar_t szCommandLine1[BUF_LEN] = L"";
	wchar_t szCommandLine2[BUF_LEN] = L"";

	MsiGetProperty(hInstall, L"TempFolder", szTmpDir, &nTmpDirLen);
	StringCchPrintf(sz7Zip, BUF_LEN, L"%s%s", szTmpDir, L"7za.exe");
	StringCchPrintf(packedTarball, BUF_LEN, L"%s%s", szTmpDir, L"meteor-bootstrap-os.windows.x86_32.tar.gz");

	DWORD pdwAttr;

	hr = ExtractBinaryToFile(L"SevenZip", sz7Zip);
	hr = ExtractBinaryToFile(L"BootstrapTarball", packedTarball);

	DWORD nRes=0;

	// Remove old Meteor installs
	wchar_t szCmdRemoveOld[BUF_LEN] = L"";
	wchar_t szSysDir[BUF_LEN] = L"";
	DWORD nSysDirLen = BUF_LEN;
	MsiGetProperty(hInstall, L"SystemFolder", szSysDir, &nSysDirLen);

	LPTSTR ErrorMessage = NULL;

	StringCchPrintf(szCmdRemoveOld, BUF_LEN, L"%s\\cmd.exe /C \"RD /S /Q \"%s\\.meteor\">NUL\"", szSysDir, wzDestPath);
	StringCchPrintf(szCommandLine1, BUF_LEN, L"\"%s\" x -o\"%s\" -y \"%s\"", sz7Zip, szSourceDir, packedTarball);
	StringCchPrintf(szCommandLine2, BUF_LEN, L"\"%s\" x -o\"%s\" -y \"%s\"", sz7Zip, wzDestPath, szTarFilePath);

	if (! ExecuteCommandLine(szCmdRemoveOld, nRes)) {
		FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, HRESULT_FROM_WIN32(nRes), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR)&ErrorMessage, 0, NULL);
		if (NULL != ErrorMessage) WcaLog(LOGMSG_STANDARD, "Deleting old install completed with (%d): %S", nRes, ErrorMessage);
		return HRESULT_FROM_WIN32(nRes);
	}

	if (! ExecuteCommandLine(szCommandLine1, nRes)) {
		FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, HRESULT_FROM_WIN32(nRes), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR)&ErrorMessage, 0, NULL);
		if (NULL != ErrorMessage) WcaLog(LOGMSG_STANDARD, "Archive expanding completed with (%d): %S", nRes, ErrorMessage);
		return HRESULT_FROM_WIN32(nRes);
	}

	if (! ExecuteCommandLine(szCommandLine2, nRes)) {
		FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM, NULL, HRESULT_FROM_WIN32(nRes), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), (LPTSTR)&ErrorMessage, 0, NULL);
		if (NULL != ErrorMessage) WcaLog(LOGMSG_STANDARD, "Archive deployment completed with (%d): %S", nRes, ErrorMessage);
		return HRESULT_FROM_WIN32(nRes);
	}

	WcaLog(LOGMSG_STANDARD, "Extracting \"%S\" package completed.", wzFriendlyName);

	return hr;
}


UINT __stdcall Extract_MeteorFiles(MSIHANDLE hInstall)
{
	HRESULT hr = S_OK;
	UINT er = ERROR_SUCCESS;

	hr = WcaInitialize(hInstall, "Extract_MeteorFiles");
	ExitOnFailure(hr, "Failed to initialize Extract_MeteorFiles");

	wchar_t szMeteorDir[BUF_LEN] = L"";	DWORD nMeteorDirLen = BUF_LEN;
	MsiGetProperty(hInstall, L"METEOR_DIR", szMeteorDir, &nMeteorDirLen);

	hr = UnzipToFolder(hInstall, L"Meteor", L"meteor-bootstrap-os.windows.x86_32.tar.gz", szMeteorDir);
	ExitOnFailure(hr, "Failed to extract Meteor files.");

LExit:
	er = SUCCEEDED(hr) ? ERROR_SUCCESS : ERROR_INSTALL_FAILURE;
	return WcaFinalize(er);
}



HRESULT Download_Package(
	MSIHANDLE hInstall,
	__in LPCWSTR wzFriendlyName,
	__in LPCWSTR wzProperty_DWNURL,
	__in LPCWSTR wzZipFile)
{
	HRESULT hr = S_OK;

	WcaLog(LOGMSG_STANDARD, "Download package \"%S\" initialized.", wzFriendlyName);

	wchar_t szSourceDir[BUF_LEN] = L"";	DWORD nSourceDirDirLen = BUF_LEN;
	wchar_t szDwnUrl[BUF_LEN]  = L"";	DWORD nDwnUrlLen  = BUF_LEN;
	wchar_t szDwnUser[BUF_LEN] = L"";	DWORD nDwnUserLen = BUF_LEN;
	wchar_t szDwnPass[BUF_LEN] = L"";	DWORD nDwnPassLen = BUF_LEN;
	wchar_t szZipFile[BUF_LEN] = L"";

	MsiGetProperty(hInstall, L"SourceDir", szSourceDir, &nSourceDirDirLen);
	MsiGetProperty(hInstall, wzProperty_DWNURL, szDwnUrl, &nDwnUrlLen);
	MsiGetProperty(hInstall, L"HTTP_DWN_USER", szDwnUser, &nDwnUserLen);
	MsiGetProperty(hInstall, L"HTTP_DWN_PASS", szDwnPass, &nDwnPassLen);
	StringCchPrintf(szZipFile, BUF_LEN, L"%s%s", szSourceDir, wzZipFile);

	// Checking for Prerequisites\localFile
	wchar_t szBundleSrc[BUF_LEN] = L"";	DWORD nBundleSrcLen = BUF_LEN;
	wchar_t szPrereqDir[BUF_LEN] = L"";	DWORD nPrereqDirLen = BUF_LEN;
	wchar_t szLocalFile[BUF_LEN] = L"";
	wchar_t* szBundlePath;
	MsiGetProperty(hInstall, L"BUNDLE_SOURCE", szBundleSrc, &nBundleSrcLen);
	MsiGetProperty(hInstall, L"PREREQ_FOLDER", szPrereqDir, &nPrereqDirLen);
	PathGetDirectory(szBundleSrc, &szBundlePath);
	StringCchPrintf(szLocalFile, BUF_LEN, L"%s%s\\%s", szBundlePath, szPrereqDir, wzZipFile);

	// If local file exists use it instaead of download.
	DWORD pdwAttr;
	if (FileExistsEx(szLocalFile, &pdwAttr) == TRUE)
	{
		FileEnsureCopy(szLocalFile, szZipFile, TRUE);
		WcaLog(LOGMSG_STANDARD, "Nginx local package found \"%S\", will use that.", szLocalFile);		
	}
	else
	{
		MyCallback pCallback;
		pCallback.iHInstall = hInstall;
		hr = URLDownloadToFile(NULL, szDwnUrl, szZipFile, 0, &pCallback);

		if (FAILED(hr))
			WcaLog(LOGMSG_STANDARD, "Failed to download %S package from url: %S", wzFriendlyName, szDwnUrl);			
		else
			WcaLog(LOGMSG_STANDARD, "%S package should be here: %S", wzFriendlyName, szZipFile);
	}

	WcaLog(LOGMSG_STANDARD, "Download package \"%S\" completed.", wzFriendlyName);

	return hr;
}



UINT __stdcall Download_MeteorPackage(MSIHANDLE hInstall)
{
	HRESULT hr = S_OK;
	UINT er = ERROR_SUCCESS;

	hr = WcaInitialize(hInstall, "Download_MeteorPackage");
	ExitOnFailure(hr, "Failed to initialize Download_MeteorPackage");

	hr = Download_Package(hInstall, L"Meteor", L"METEOR_DWN_URL", L"meteor-bootstrap-os.windows.x86_32.tar.gz");
	ExitOnFailure(hr, "Failed to download Meteor package from specified URL."); 

LExit:
	er = SUCCEEDED(hr) ? ERROR_SUCCESS : ERROR_INSTALL_FAILURE;
	return WcaFinalize(er);
}




UINT __stdcall BulkRemoveMeteorFiles(MSIHANDLE hInstall)
{
	HRESULT hr = S_OK;
	UINT er = ERROR_SUCCESS;

	hr = WcaInitialize(hInstall, "BulkRemoveMeteorFiles");
	ExitOnFailure(hr, "Failed to initialize BulkRemoveMeteorFiles");

	WcaLog(LOGMSG_STANDARD, "BulkRemoveMeteorFiles Initialized.");

	wchar_t szPathPackages[BUF_LEN] = L"";	DWORD nPathPackages = BUF_LEN;
	wchar_t szPathPkg_Meta[BUF_LEN]  = L"";	DWORD nPathPkg_Meta  = BUF_LEN;

	MsiGetProperty(hInstall, L"METEORDIR_PACKAGES", szPathPackages, &nPathPackages);
	MsiGetProperty(hInstall, L"METEORDIR_PKG_META", szPathPkg_Meta, &nPathPkg_Meta);
	
	wchar_t szSysDir[BUF_LEN] = L"";	DWORD nSysDirLen = BUF_LEN;
	wchar_t szCmd1[BUF_LEN] = L"";		
	wchar_t szCmd2[BUF_LEN] = L"";	

	DWORD nRes=0;
	
	
	MsiGetProperty(hInstall, L"SystemFolder", szSysDir, &nSysDirLen);
	StringCchPrintf(szCmd1, BUF_LEN, L"%s\\cmd.exe /C \"RD /S /Q \"%s\">NUL\"", szSysDir, szPathPackages);
	StringCchPrintf(szCmd2, BUF_LEN, L"%s\\cmd.exe /C \"RD /S /Q \"%s\">NUL\"", szSysDir, szPathPkg_Meta);

	ExecuteCommandLine(szCmd1, nRes);
	ExecuteCommandLine(szCmd2, nRes);

	WcaLog(LOGMSG_STANDARD, "BulkRemoveMeteorFiles done.");

LExit:
	er = SUCCEEDED(hr) ? ERROR_SUCCESS : ERROR_INSTALL_FAILURE;
	return WcaFinalize(er);
}




// DllMain - Initialize and cleanup WiX custom action utils.
extern "C" BOOL WINAPI DllMain(
	__in HINSTANCE hInst,
	__in ULONG ulReason,
	__in LPVOID
	)
{
	switch(ulReason)
	{
	case DLL_PROCESS_ATTACH:
		WcaGlobalInitialize(hInst);
		break;

	case DLL_PROCESS_DETACH:
		WcaGlobalFinalize();
		break;
	}

	return TRUE;
}
