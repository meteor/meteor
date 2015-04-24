//-------------------------------------------------------------------------------------------------
// <copyright file="WixStandardBootstrapperApplication.cpp" company="Outercurve Foundation">
//   Copyright (c) 2004, Outercurve Foundation.
//   This software is released under Microsoft Reciprocal License (MS-RL).
//   The license and further copyright text can be found in the file
//   LICENSE.TXT at the root directory of the distribution.
// </copyright>
//-------------------------------------------------------------------------------------------------


#include "precomp.h"
#include "regutil.h"
#include "JSON.h"
#include <windows.h>
#include <string>
#include <sstream>


static const HRESULT E_WIXSTDBA_CONDITION_FAILED = MAKE_HRESULT(SEVERITY_ERROR, 500, 1);

static const LPCWSTR WIXBUNDLE_VARIABLE_ELEVATED = L"WixBundleElevated";

static const LPCWSTR WIXSTDBA_WINDOW_CLASS                = L"WixExtBA";
static const LPCWSTR WIXSTDBA_VARIABLE_INSTALL_FOLDER     = L"InstallFolder";
static const LPCWSTR WIXSTDBA_VARIABLE_INSTALL_REGPATH    = L"InstallRegPath";
static const LPCWSTR WIXSTDBA_VARIABLE_LAUNCH_TARGET_PATH = L"LaunchTarget";
static const LPCWSTR WIXSTDBA_VARIABLE_LAUNCH_ARGUMENTS   = L"LaunchArguments";
static const LPCWSTR WIXSTDBA_VARIABLE_LAUNCH_HIDDEN      = L"LaunchHidden";
static const LPCWSTR WIXSTDBA_VARIABLE_LAUNCHAFTERINSTALL_TARGET_PATH = L"LaunchAfterInstallTarget";
static const LPCWSTR WIXSTDBA_VARIABLE_LAUNCHAFTERINSTALL_ARGUMENTS   = L"LaunchAfterInstallArguments";

static const LPCWSTR WIXSTDBA_VARIABLE_VERSION = L"MeteorVersion";
static const LPCWSTR WIXSTDBA_VARIABLE_PROGRESS_HEADER = L"varProgressHeader";
static const LPCWSTR WIXSTDBA_VARIABLE_PROGRESS_INFO   = L"varProgressInfo";
static const LPCWSTR WIXSTDBA_VARIABLE_SUCCESS_HEADER  = L"varSuccessHeader";
static const LPCWSTR WIXSTDBA_VARIABLE_SUCCESS_INFO    = L"varSuccessInfo";
static const LPCWSTR WIXSTDBA_VARIABLE_FAILURE_HEADER  = L"varFailureHeader";
static const LPCWSTR WIXSTDBA_VARIABLE_SUCCESS_ERRINF  = L"varSuccessErrorInfoText";
static const LPCWSTR WIXSTDBA_VARIABLE_SUCCESS_ERRMSG  = L"varSuccessErrorMessageText";

static const LPCWSTR WIXSTDBA_VARIABLE_PERMACHINE_INSTALL  = L"PerMachineInstall";
static const LPCWSTR WIXSTDBA_VARIABLE_PERMACHINE_INSTALL_FOLDER  = L"PerMachineInstallFolder";
static const LPCWSTR WIXSTDBA_VARIABLE_PERUSER_INSTALL_FOLDER     = L"PerUserInstallFolder";
static const LPCWSTR WIXSTDBA_VARIABLE_USERMETEORSESSIONFILE      = L"UserMeteorSessionFile";


static const LPCWSTR WIXSTDBA_VARIABLE_REG_MAIL     = L"RegisterEmail";
static const LPCWSTR WIXSTDBA_VARIABLE_REG_USER     = L"RegisterUser";
static const LPCWSTR WIXSTDBA_VARIABLE_REG_PASS     = L"RegisterPass";

static const LPCWSTR WIXSTDBA_VARIABLE_LOG_USERNAME_OR_MAIL = L"LoginUsernameOrEmail";
static const LPCWSTR WIXSTDBA_VARIABLE_LOG_PASS             = L"LoginPass";


static const LPCWSTR WIXSTDBA_VARIABLE_LOGSPATH        = L"QCInstallLogsPath";

static const DWORD WIXSTDBA_ACQUIRE_PERCENTAGE = 1;

enum WIXSTDBA_STATE
{
	WIXSTDBA_STATE_INSTALLDIR,
	WIXSTDBA_STATE_SVC_OPTIONS,
	WIXSTDBA_STATE_INITIALIZING,
	WIXSTDBA_STATE_INITIALIZED,
	WIXSTDBA_STATE_HELP,
	WIXSTDBA_STATE_DETECTING,
	WIXSTDBA_STATE_DETECTED,
	WIXSTDBA_STATE_PLANNING,
	WIXSTDBA_STATE_PLANNED,
	WIXSTDBA_STATE_APPLYING,
	WIXSTDBA_STATE_CACHING,
	WIXSTDBA_STATE_CACHED,
	WIXSTDBA_STATE_EXECUTING,
	WIXSTDBA_STATE_EXECUTED,
	WIXSTDBA_STATE_APPLIED,
	WIXSTDBA_STATE_FAILED,
};

enum WM_WIXSTDBA
{
	WM_WIXSTDBA_SHOW_HELP = WM_APP + 100,
	WM_WIXSTDBA_DETECT_PACKAGES,
	WM_WIXSTDBA_PLAN_PACKAGES,
	WM_WIXSTDBA_APPLY_PACKAGES,
	WM_WIXSTDBA_CHANGE_STATE,
};

// This enum must be kept in the same order as the vrgwzPageNames array.
enum WIXSTDBA_PAGE
{
	WIXSTDBA_PAGE_LOADING,
	WIXSTDBA_PAGE_HELP,
	WIXSTDBA_PAGE_INSTALL,
	WIXSTDBA_PAGE_INSTALLDIR,
	WIXSTDBA_PAGE_SVC_OPTIONS,
	WIXSTDBA_PAGE_MODIFY,
	WIXSTDBA_PAGE_PROGRESS,
	WIXSTDBA_PAGE_PROGRESS_PASSIVE,
	WIXSTDBA_PAGE_SUCCESS,
	WIXSTDBA_PAGE_FAILURE,
	COUNT_WIXSTDBA_PAGE,
};

// This array must be kept in the same order as the WIXSTDBA_PAGE enum.
static LPCWSTR vrgwzPageNames[] = {
	L"Loading",
	L"Help",
	L"Install",
	L"InstallDir",
	L"SvcOptions",
	L"Modify",
	L"Progress",
	L"ProgressPassive",
	L"Success",
	L"Failure",
};

enum WIXSTDBA_CONTROL
{
	// Non-paged controls
	WIXSTDBA_CONTROL_CLOSE_BUTTON = THEME_FIRST_ASSIGN_CONTROL_ID,
	WIXSTDBA_CONTROL_MINIMIZE_BUTTON,

	// Help page
	WIXSTDBA_CONTROL_HELP_CANCEL_BUTTON,

	// Welcome page
	WIXSTDBA_CONTROL_INSTALL_BUTTON,
	WIXSTDBA_CONTROL_OPTIONS_BUTTON,
	WIXSTDBA_CONTROL_EULA_RICHEDIT,
	WIXSTDBA_CONTROL_EULA_LINK,
	WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX,
	WIXSTDBA_CONTROL_WELCOME_CANCEL_BUTTON,
	WIXSTDBA_CONTROL_VERSION_LABEL,
	WIXSTDBA_CONTROL_UPGRADE_LINK,
	WIXSTDBA_CONTROL_NEXT_BUTTON,
	WIXSTDBA_CONTROL_BACK_BUTTON,
	WIXSTDBA_CONTROL_SKIP_BUTTON,


	// Options page
	WIXSTDBA_CONTROL_PERMACHINE_RADIO,
	WIXSTDBA_CONTROL_PERUSER_RADIO,
	WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX,
	WIXSTDBA_CONTROL_BROWSE_BUTTON,

	WIXSTDBA_CONTROL_REGSIGNIN_RADIO,
	WIXSTDBA_CONTROL_REGCREATE_RADIO,
	WIXSTDBA_CONTROL_REGMAIL_LABEL,
	WIXSTDBA_CONTROL_REGUSER_LABEL,
	WIXSTDBA_CONTROL_REGPASS_LABEL,
	WIXSTDBA_CONTROL_REGMAIL_EDIT,
	WIXSTDBA_CONTROL_REGUSER_EDIT,
	WIXSTDBA_CONTROL_REGPASS_EDIT,

	WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_LABEL,
	WIXSTDBA_CONTROL_LOGPASS_LABEL,
	WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_EDIT,
	WIXSTDBA_CONTROL_LOGPASS_EDIT,

	WIXSTDBA_CONTROL_SKIPREG_CHECKBOX,


	WIXSTDBA_CONTROL_OK_BUTTON,
	WIXSTDBA_CONTROL_CANCEL_BUTTON,

	// Modify page
	WIXSTDBA_CONTROL_REPAIR_BUTTON,
	WIXSTDBA_CONTROL_UNINSTALL_BUTTON,
	WIXSTDBA_CONTROL_MODIFY_CANCEL_BUTTON,

	// Progress page
	WIXSTDBA_CONTROL_CACHE_PROGRESS_PACKAGE_TEXT,
	WIXSTDBA_CONTROL_CACHE_PROGRESS_BAR,
	WIXSTDBA_CONTROL_CACHE_PROGRESS_TEXT,

	WIXSTDBA_CONTROL_EXECUTE_PROGRESS_PACKAGE_TEXT,
	WIXSTDBA_CONTROL_EXECUTE_PROGRESS_BAR,
	WIXSTDBA_CONTROL_EXECUTE_PROGRESS_TEXT,
	WIXSTDBA_CONTROL_EXECUTE_PROGRESS_ACTIONDATA_TEXT,

	WIXSTDBA_CONTROL_OVERALL_PROGRESS_PACKAGE_TEXT,
	WIXSTDBA_CONTROL_OVERALL_PROGRESS_BAR,
	WIXSTDBA_CONTROL_OVERALL_CALCULATED_PROGRESS_BAR,
	WIXSTDBA_CONTROL_OVERALL_PROGRESS_TEXT,

	WIXSTDBA_CONTROL_PROGRESS_CANCEL_BUTTON,

	// Success page
	WIXSTDBA_CONTROL_LAUNCH_BUTTON,
	WIXSTDBA_CONTROL_SUCCESS_RESTART_TEXT,
	WIXSTDBA_CONTROL_SUCCESS_RESTART_BUTTON,
	WIXSTDBA_CONTROL_SUCCESS_CANCEL_BUTTON,
	WIXSTDBA_CONTROL_SUCCESS_ERRINF_TEXT,
	WIXSTDBA_CONTROL_SUCCESS_ERRMSG_TEXT,

	// Failure page
	WIXSTDBA_CONTROL_FAILURE_LOGFILE_LINK,
	WIXSTDBA_CONTROL_FAILURE_MESSAGE_TEXT,
	WIXSTDBA_CONTROL_FAILURE_RESTART_TEXT,
	WIXSTDBA_CONTROL_FAILURE_RESTART_BUTTON,
	WIXSTDBA_CONTROL_FAILURE_CANCEL_BUTTON,
};

static THEME_ASSIGN_CONTROL_ID vrgInitControls[] = {
	{ WIXSTDBA_CONTROL_CLOSE_BUTTON, L"CloseButton" },
	{ WIXSTDBA_CONTROL_MINIMIZE_BUTTON, L"MinimizeButton" },

	{ WIXSTDBA_CONTROL_HELP_CANCEL_BUTTON, L"HelpCancelButton" },

	{ WIXSTDBA_CONTROL_INSTALL_BUTTON, L"InstallButton" },
	{ WIXSTDBA_CONTROL_OPTIONS_BUTTON, L"OptionsButton" },
	{ WIXSTDBA_CONTROL_EULA_RICHEDIT, L"EulaRichedit" },
	{ WIXSTDBA_CONTROL_EULA_LINK, L"EulaHyperlink" },
	{ WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX, L"EulaAcceptCheckbox" },
	{ WIXSTDBA_CONTROL_WELCOME_CANCEL_BUTTON, L"WelcomeCancelButton" },
	{ WIXSTDBA_CONTROL_VERSION_LABEL, L"InstallVersion" },
	{ WIXSTDBA_CONTROL_UPGRADE_LINK, L"UpgradeHyperlink" },
	{ WIXSTDBA_CONTROL_NEXT_BUTTON, L"NextButton" },
	{ WIXSTDBA_CONTROL_BACK_BUTTON, L"BackButton" },
	{ WIXSTDBA_CONTROL_SKIP_BUTTON, L"SkipButton" },

	{WIXSTDBA_CONTROL_PERMACHINE_RADIO, L"PerMachineInstall" },
	{WIXSTDBA_CONTROL_PERUSER_RADIO, L"PerUserInstall" },
	{ WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX, L"InstallFolderEditbox" },
	{ WIXSTDBA_CONTROL_BROWSE_BUTTON, L"BrowseButton" },

	{WIXSTDBA_CONTROL_REGSIGNIN_RADIO, L"SignInRButton"},
	{WIXSTDBA_CONTROL_REGCREATE_RADIO, L"CreateRButton"},
	{WIXSTDBA_CONTROL_REGMAIL_LABEL, L"RegisterEmailLabel"},
	{WIXSTDBA_CONTROL_REGUSER_LABEL, L"RegisterUserLabel"},
	{WIXSTDBA_CONTROL_REGPASS_LABEL, L"RegisterPassLabel"},
	{WIXSTDBA_CONTROL_REGMAIL_EDIT, L"RegisterEmail"},
	{WIXSTDBA_CONTROL_REGUSER_EDIT, L"RegisterUser"},
	{WIXSTDBA_CONTROL_REGPASS_EDIT, L"RegisterPass"},

	{WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_LABEL, L"LoginUsernameOrEmailLabel"},
	{WIXSTDBA_CONTROL_LOGPASS_LABEL, L"LoginPassLabel"},
	{WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_EDIT, L"LoginUsernameOrEmail"},
	{WIXSTDBA_CONTROL_LOGPASS_EDIT, L"LoginPass"},

	{WIXSTDBA_CONTROL_SKIPREG_CHECKBOX, L"SkipRegistration"},

	{ WIXSTDBA_CONTROL_REPAIR_BUTTON, L"RepairButton" },
	{ WIXSTDBA_CONTROL_UNINSTALL_BUTTON, L"UninstallButton" },
	{ WIXSTDBA_CONTROL_MODIFY_CANCEL_BUTTON, L"ModifyCancelButton" },

	{ WIXSTDBA_CONTROL_CACHE_PROGRESS_PACKAGE_TEXT, L"CacheProgressPackageText" },
	{ WIXSTDBA_CONTROL_CACHE_PROGRESS_BAR, L"CacheProgressbar" },
	{ WIXSTDBA_CONTROL_CACHE_PROGRESS_TEXT, L"CacheProgressText" },
	{ WIXSTDBA_CONTROL_EXECUTE_PROGRESS_PACKAGE_TEXT, L"ExecuteProgressPackageText" },
	{ WIXSTDBA_CONTROL_EXECUTE_PROGRESS_BAR, L"ExecuteProgressbar" },
	{ WIXSTDBA_CONTROL_EXECUTE_PROGRESS_TEXT, L"ExecuteProgressText" },
	{ WIXSTDBA_CONTROL_EXECUTE_PROGRESS_ACTIONDATA_TEXT, L"ExecuteProgressActionDataText"},
	{ WIXSTDBA_CONTROL_OVERALL_PROGRESS_PACKAGE_TEXT, L"OverallProgressPackageText" },
	{ WIXSTDBA_CONTROL_OVERALL_PROGRESS_BAR, L"OverallProgressbar" },
	{ WIXSTDBA_CONTROL_OVERALL_CALCULATED_PROGRESS_BAR, L"OverallCalculatedProgressbar" },
	{ WIXSTDBA_CONTROL_OVERALL_PROGRESS_TEXT, L"OverallProgressText" },
	{ WIXSTDBA_CONTROL_PROGRESS_CANCEL_BUTTON, L"ProgressCancelButton" },

	{ WIXSTDBA_CONTROL_LAUNCH_BUTTON, L"LaunchButton" },
	{ WIXSTDBA_CONTROL_SUCCESS_RESTART_TEXT, L"SuccessRestartText" },
	{ WIXSTDBA_CONTROL_SUCCESS_RESTART_BUTTON, L"SuccessRestartButton" },
	{ WIXSTDBA_CONTROL_SUCCESS_CANCEL_BUTTON, L"SuccessCancelButton" },
	{ WIXSTDBA_CONTROL_SUCCESS_ERRINF_TEXT, L"SuccessErrorInfoText" },
	{ WIXSTDBA_CONTROL_SUCCESS_ERRMSG_TEXT, L"SuccessErrorMessageText" },

	{ WIXSTDBA_CONTROL_FAILURE_LOGFILE_LINK, L"FailureLogFileLink" },
	{ WIXSTDBA_CONTROL_FAILURE_MESSAGE_TEXT, L"FailureMessageText" },
	{ WIXSTDBA_CONTROL_FAILURE_RESTART_TEXT, L"FailureRestartText" },
	{ WIXSTDBA_CONTROL_FAILURE_RESTART_BUTTON, L"FailureRestartButton" },
	{ WIXSTDBA_CONTROL_FAILURE_CANCEL_BUTTON, L"FailureCloseButton" },
};


void ExtractActionProgressText(
	__in_z LPCWSTR wzActionMessage,
	__in_z LPCWSTR *pwzActionProgressText
	)
{
	if (!wzActionMessage)
		return;

	DWORD i = 0;
	LPCWSTR wzActionProgressText = wzActionMessage;

	LPCWSTR wz = wzActionMessage;
	while (*wz)
    {
		if (L' ' == *wz) ++i;
		if (i <= 2) wzActionProgressText++;

        ++wz;
    }
	*pwzActionProgressText = wzActionProgressText;

	return;
}




class CWixStandardBootstrapperApplication : public CBalBaseBootstrapperApplication
{
public: // IBootstrapperApplication
	virtual STDMETHODIMP OnStartup()
	{
		HRESULT hr = S_OK;
		DWORD dwUIThreadId = 0;

		// create UI thread
		m_hUiThread = ::CreateThread(NULL, 0, UiThreadProc, this, 0, &dwUIThreadId);
		if (!m_hUiThread)
		{
			ExitWithLastError(hr, "Failed to create UI thread.");
		}

LExit:
		return hr;
	}


	virtual STDMETHODIMP_(int) OnShutdown()
	{
		int nResult = IDNOACTION;

		// wait for UI thread to terminate
		if (m_hUiThread)
		{
			::WaitForSingleObject(m_hUiThread, INFINITE);
			ReleaseHandle(m_hUiThread);
		}

		// If a restart was required.
		if (m_fRestartRequired)
		{
			if (m_fAllowRestart)
			{
				nResult = IDRESTART;
			}

			if (m_sczPrereqPackage)
			{
				BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, m_fAllowRestart ? "The prerequisites scheduled a restart. The bootstrapper application will be reloaded after the computer is restarted."
					: "A restart is required by the prerequisites but the user delayed it. The bootstrapper application will be reloaded after the computer is restarted.");
			}
		}
		else if (m_fPrereqInstalled)
		{
			BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "The prerequisites were successfully installed. The bootstrapper application will be reloaded.");
			nResult = IDRELOAD_BOOTSTRAPPER;
		}
		else if (m_fPrereqAlreadyInstalled)
		{
			BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "The prerequisites were already installed. The bootstrapper application will not be reloaded to prevent an infinite loop.");
		}
		else if (m_fPrereq)
		{
			BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "The prerequisites were not successfully installed, error: 0x%x. The bootstrapper application will be not reloaded.", m_hrFinal);
		}

		return nResult;
	}


	virtual STDMETHODIMP_(int) OnDetectRelatedBundle(
		__in LPCWSTR wzBundleId,
		__in BOOTSTRAPPER_RELATION_TYPE relationType,
		__in LPCWSTR /*wzBundleTag*/,
		__in BOOL fPerMachine,
		__in DWORD64 /*dw64Version*/,
		__in BOOTSTRAPPER_RELATED_OPERATION operation
		)
	{
		BalInfoAddRelatedBundleAsPackage(&m_Bundle.packages, wzBundleId, relationType, fPerMachine);
		// If we're not doing a pre-req install, remember when our bundle would cause a downgrade.
		if (!m_sczPrereqPackage && BOOTSTRAPPER_RELATED_OPERATION_DOWNGRADE == operation)
		{
			m_fDowngrading = TRUE;
		}

		m_Operation = operation; // Save operation

		return CheckCanceled() ? IDCANCEL : IDOK;
	}


	virtual STDMETHODIMP_(void) OnDetectPackageComplete(
		__in LPCWSTR wzPackageId,
		__in HRESULT /*hrStatus*/,
		__in BOOTSTRAPPER_PACKAGE_STATE state
		)
	{
		// If the prereq package is already installed, remember that.
		if (m_sczPrereqPackage && BOOTSTRAPPER_PACKAGE_STATE_PRESENT == state &&
			CSTR_EQUAL == ::CompareStringW(LOCALE_NEUTRAL, 0, wzPackageId, -1, m_sczPrereqPackage, -1))
		{
			m_fPrereqAlreadyInstalled = TRUE;
		}
	}


	// OnDetectUpdateBegin - called when the engine begins detection for bundle update.
	virtual STDMETHODIMP_(int) OnDetectUpdateBegin(
		__in_z LPCWSTR wzUpdateLocation,
		__in int nRecommendation
		)
	{
		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Update location: %ls.", wzUpdateLocation);

		m_wzUpdateLocation = wzUpdateLocation;
		// If there is an upgrade link, check for update on a background thread
		if (ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_UPGRADE_LINK))
		{
			ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_UPGRADE_LINK, FALSE);
			::CreateThread(NULL, 0, ThreadProc, this, 0, NULL);
		}

		return nRecommendation;
	}


	virtual STDMETHODIMP_(int) OnDetectBegin(
		__in BOOL /*fInstalled*/,
		__in DWORD /*cPackages*/
		)
	{
		return IDNOACTION;
	}


	virtual STDMETHODIMP_(void) OnDetectComplete(
		__in HRESULT hrStatus
		)
	{
		if (SUCCEEDED(hrStatus) && m_pBAFunction)
		{
			m_pBAFunction->OnDetectComplete();
		}

		if (SUCCEEDED(hrStatus))
		{
			hrStatus = EvaluateConditions();
		}

		if (m_command.action == BOOTSTRAPPER_ACTION_UNINSTALL)
			this->OnPlan(BOOTSTRAPPER_ACTION_UNINSTALL);
		else
			this->OnPlan(BOOTSTRAPPER_ACTION_INSTALL);

		// Doing some custom vars handling
		//if (BalStringVariableExists(WIXSTDBA_VARIABLE_DETECT_POSTGRES))
		//{
		//	LONGLONG llValue = 0;
		//	BalGetNumericVariable(WIXSTDBA_VARIABLE_DETECT_POSTGRES, &llValue);
		//	if (llValue == 1)
		//		m_pEngine->SetVariableNumeric(WIXSTDBA_VARIABLE_INSTALL_POSTGRES, 0);
		//}


		// If we're not interacting with the user or we're doing a layout or we're just after a force restart
		// then automatically start planning.
		if (BOOTSTRAPPER_DISPLAY_FULL > m_command.display || BOOTSTRAPPER_ACTION_LAYOUT == m_command.action || BOOTSTRAPPER_RESUME_TYPE_REBOOT == m_command.resumeType)
		{
			if (SUCCEEDED(hrStatus))
			{
				::PostMessageW(m_hWnd, WM_WIXSTDBA_PLAN_PACKAGES, 0, m_command.action);
			}
		}
	}


	virtual STDMETHODIMP_(int) OnPlanRelatedBundle(
		__in_z LPCWSTR /*wzBundleId*/,
		__inout_z BOOTSTRAPPER_REQUEST_STATE* pRequestedState
		)
	{
		// If we're only installing prereq, do not touch related bundles.
		if (m_sczPrereqPackage)
		{
			*pRequestedState = BOOTSTRAPPER_REQUEST_STATE_NONE;
		}
		else if (BOOTSTRAPPER_RELATED_OPERATION_NONE == m_Operation &&
			BOOTSTRAPPER_REQUEST_STATE_NONE == *pRequestedState &&
			BOOTSTRAPPER_RELATION_UPGRADE != m_command.relationType)
		{
			// Same version upgrade detected, mark absent so the install runs
			*pRequestedState = BOOTSTRAPPER_REQUEST_STATE_ABSENT;
		}

		return CheckCanceled() ? IDCANCEL : IDOK;
	}


	virtual STDMETHODIMP_(int) OnPlanPackageBegin(
		__in_z LPCWSTR wzPackageId,
		__inout BOOTSTRAPPER_REQUEST_STATE *pRequestState
		)
	{
		// If we're planning to install a pre-req, install it. The pre-req needs to be installed
		// in all cases (even uninstall!) so the BA can load next.
		if (m_sczPrereqPackage)
		{
			if (CSTR_EQUAL == ::CompareStringW(LOCALE_NEUTRAL, 0, wzPackageId, -1, m_sczPrereqPackage, -1))
			{
				*pRequestState = BOOTSTRAPPER_REQUEST_STATE_PRESENT;
			}
			else // skip everything else.
			{
				*pRequestState = BOOTSTRAPPER_REQUEST_STATE_NONE;
			}
		}
		else if (m_sczAfterForcedRestartPackage) // after force restart skip packages until after the package that caused the restart.
		{
			// After restart we need to finish the dependency registration for our package so allow the package
			// to go present.
			if (CSTR_EQUAL == ::CompareStringW(LOCALE_NEUTRAL, 0, wzPackageId, -1, m_sczAfterForcedRestartPackage, -1))
			{
				// Do not allow a repair because that could put us in a perpetual restart loop.
				if (BOOTSTRAPPER_REQUEST_STATE_REPAIR == *pRequestState)
				{
					*pRequestState = BOOTSTRAPPER_REQUEST_STATE_PRESENT;
				}

				ReleaseNullStr(m_sczAfterForcedRestartPackage); // no more skipping now.
			}
			else // not the matching package, so skip it.
			{
				BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Skipping package: %ls, after restart because it was applied before the restart.", wzPackageId);

				*pRequestState = BOOTSTRAPPER_REQUEST_STATE_NONE;
			}
		}

		return CheckCanceled() ? IDCANCEL : IDOK;
	}


	virtual STDMETHODIMP_(void) OnPlanComplete(
		__in HRESULT hrStatus
		)
	{
		if (SUCCEEDED(hrStatus) && m_pBAFunction)
		{
			m_pBAFunction->OnPlanComplete();
		}

		SetState(WIXSTDBA_STATE_PLANNED, hrStatus);

		if (SUCCEEDED(hrStatus))
		{
			::PostMessageW(m_hWnd, WM_WIXSTDBA_APPLY_PACKAGES, 0, 0);
		}

		m_fStartedExecution = FALSE;
		m_dwCalculatedCacheProgress = 0;
		m_dwCalculatedExecuteProgress = 0;
	}


	virtual STDMETHODIMP_(int) OnCachePackageBegin(
		__in_z LPCWSTR wzPackageId,
		__in DWORD cCachePayloads,
		__in DWORD64 dw64PackageCacheSize
		)
	{
		if (wzPackageId && *wzPackageId)
		{
			BAL_INFO_PACKAGE* pPackage = NULL;
			HRESULT hr = BalInfoFindPackageById(&m_Bundle.packages, wzPackageId, &pPackage);
			LPCWSTR wz = (SUCCEEDED(hr) && pPackage->sczDisplayName) ? pPackage->sczDisplayName : wzPackageId;

			WCHAR wzInfo[1024] = { };
			::StringCchPrintfW(wzInfo, countof(wzInfo), L"Acquiring %s package...", wz);
			ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_CACHE_PROGRESS_PACKAGE_TEXT, wzInfo);
			// If something started executing, leave it in the overall progress text.
			if (!m_fStartedExecution)
			{
				ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_PROGRESS_PACKAGE_TEXT, wzInfo);
			}
		}

		return __super::OnCachePackageBegin(wzPackageId, cCachePayloads, dw64PackageCacheSize);
	}

	virtual STDMETHODIMP_(int) OnCacheAcquireProgress(
		__in_z LPCWSTR wzPackageOrContainerId,
		__in_z_opt LPCWSTR wzPayloadId,
		__in DWORD64 dw64Progress,
		__in DWORD64 dw64Total,
		__in DWORD dwOverallPercentage
		)
	{
		WCHAR wzProgress[5] = { };

#ifdef DEBUG
		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "WIXSTDBA: OnCacheAcquireProgress() - container/package: %ls, payload: %ls, progress: %I64u, total: %I64u, overall progress: %u%%", wzPackageOrContainerId, wzPayloadId, dw64Progress, dw64Total, dwOverallPercentage);
#endif

		::StringCchPrintfW(wzProgress, countof(wzProgress), L"%u%%", dwOverallPercentage);
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_CACHE_PROGRESS_TEXT, wzProgress);
		ThemeSetProgressControl(m_pTheme, WIXSTDBA_CONTROL_CACHE_PROGRESS_BAR, dwOverallPercentage);

		BAL_INFO_PACKAGE* pPackage = NULL;
		HRESULT hr = BalInfoFindPackageById(&m_Bundle.packages, wzPackageOrContainerId, &pPackage);
		LPCWSTR wzPackageName = (SUCCEEDED(hr) && pPackage->sczDisplayName) ? pPackage->sczDisplayName : wzPackageOrContainerId;

		WCHAR wzInfo[1024] = { };
		::StringCchPrintfW(wzInfo, countof(wzInfo), L"Acquiring %s package...  [ %u%% ]", wzPackageName, dwOverallPercentage);
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_PROGRESS_PACKAGE_TEXT, wzInfo);

		// Restrict progress to 100% to hide burn engine progress bug.
		// m_dwCalculatedCacheProgress = min(dwOverallPercentage, 100) * WIXSTDBA_ACQUIRE_PERCENTAGE / 100;

#ifdef DEBUG
		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "WIXSTDBA: OnCacheAcquireProgress() - calculated progress: %u%%, displayed progress: %u%%", m_dwCalculatedCacheProgress, m_dwCalculatedCacheProgress + m_dwCalculatedExecuteProgress);
#endif
		m_dwCalculatedCacheProgress = dwOverallPercentage * WIXSTDBA_ACQUIRE_PERCENTAGE / 100;
		ThemeSetProgressControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_CALCULATED_PROGRESS_BAR, m_dwCalculatedCacheProgress + m_dwCalculatedExecuteProgress);

		SetTaskbarButtonProgress(m_dwCalculatedCacheProgress + m_dwCalculatedExecuteProgress);

		return __super::OnCacheAcquireProgress(wzPackageOrContainerId, wzPayloadId, dw64Progress, dw64Total, dwOverallPercentage);
	}


	virtual STDMETHODIMP_(int) OnCacheAcquireComplete(
		__in_z LPCWSTR wzPackageOrContainerId,
		__in_z_opt LPCWSTR wzPayloadId,
		__in HRESULT hrStatus,
		__in int nRecommendation
		)
	{
		SetProgressState(hrStatus);
		return __super::OnCacheAcquireComplete(wzPackageOrContainerId, wzPayloadId, hrStatus, nRecommendation);
	}


	virtual STDMETHODIMP_(int) OnCacheVerifyComplete(
		__in_z LPCWSTR wzPackageId,
		__in_z LPCWSTR wzPayloadId,
		__in HRESULT hrStatus,
		__in int nRecommendation
		)
	{
		SetProgressState(hrStatus);
		return __super::OnCacheVerifyComplete(wzPackageId, wzPayloadId, hrStatus, nRecommendation);
	}

	virtual STDMETHODIMP_(void) OnCacheComplete(
		__in HRESULT /*hrStatus*/
		)
	{
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_CACHE_PROGRESS_PACKAGE_TEXT, L"");
		SetState(WIXSTDBA_STATE_CACHED, S_OK); // we always return success here and let OnApplyComplete() deal with the error.
	}


	virtual STDMETHODIMP_(int) OnError(
		__in BOOTSTRAPPER_ERROR_TYPE errorType,
		__in LPCWSTR wzPackageId,
		__in DWORD dwCode,
		__in_z LPCWSTR wzError,
		__in DWORD dwUIHint,
		__in DWORD /*cData*/,
		__in_ecount_z_opt(cData) LPCWSTR* /*rgwzData*/,
		__in int nRecommendation
		)
	{
		int nResult = nRecommendation;
		LPWSTR sczError = NULL;

		if (BOOTSTRAPPER_DISPLAY_EMBEDDED == m_command.display)
		{
			HRESULT hr = m_pEngine->SendEmbeddedError(dwCode, wzError, dwUIHint, &nResult);
			if (FAILED(hr))
			{
				nResult = IDERROR;
			}
		}
		else if (BOOTSTRAPPER_DISPLAY_FULL == m_command.display)
		{
			// If this is an authentication failure, let the engine try to handle it for us.
			if (BOOTSTRAPPER_ERROR_TYPE_HTTP_AUTH_SERVER == errorType || BOOTSTRAPPER_ERROR_TYPE_HTTP_AUTH_PROXY == errorType)
			{
				nResult = IDTRYAGAIN;
			}
			else // show a generic error message box.
			{
				BalRetryErrorOccurred(wzPackageId, dwCode);

				if (!m_fShowingInternalUiThisPackage)
				{
					// If no error message was provided, use the error code to try and get an error message.
					if (!wzError || !*wzError || BOOTSTRAPPER_ERROR_TYPE_WINDOWS_INSTALLER != errorType)
					{
						HRESULT hr = StrAllocFromError(&sczError, dwCode, NULL);
						if (FAILED(hr) || !sczError || !*sczError)
						{
							StrAllocFormatted(&sczError, L"0x%x", dwCode);
						}
					}

					nResult = ::MessageBoxW(m_hWnd, sczError ? sczError : wzError, m_pTheme->sczCaption, dwUIHint);
				}
			}

			SetProgressState(HRESULT_FROM_WIN32(dwCode));
		}
		else // just take note of the error code and let things continue.
		{
			BalRetryErrorOccurred(wzPackageId, dwCode);
		}

		ReleaseStr(sczError);
		return nResult;
	}


	virtual STDMETHODIMP_(int) OnExecuteMsiMessage(
		__in_z LPCWSTR wzPackageId,
		__in INSTALLMESSAGE mt,
		__in UINT uiFlags,
		__in_z LPCWSTR wzMessage,
		__in DWORD cData,
		__in_ecount_z_opt(cData) LPCWSTR* rgwzData,
		__in int nRecommendation
		)
	{
#ifdef DEBUG
		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "WIXSTDBA: OnExecuteMsiMessage() - package: %ls, message: %ls", wzPackageId, wzMessage);
#endif
		if (BOOTSTRAPPER_DISPLAY_FULL == m_command.display && (INSTALLMESSAGE_WARNING == mt || INSTALLMESSAGE_USER == mt))
		{
			int nResult = ::MessageBoxW(m_hWnd, wzMessage, m_pTheme->sczCaption, uiFlags);
			return nResult;
		}

		if (INSTALLMESSAGE_ACTIONSTART == mt)
		{
			LPCWSTR wzActionProgressText = NULL;
			ExtractActionProgressText(wzMessage, &wzActionProgressText);
			ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_EXECUTE_PROGRESS_ACTIONDATA_TEXT, wzActionProgressText);
		}

		return __super::OnExecuteMsiMessage(wzPackageId, mt, uiFlags, wzMessage, cData, rgwzData, nRecommendation);
	}


	virtual STDMETHODIMP_(int) OnProgress(
		__in DWORD dwProgressPercentage,
		__in DWORD dwOverallProgressPercentage
		)
	{
		WCHAR wzProgress[5] = { };

#ifdef DEBUG
		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "WIXSTDBA: OnProgress() - progress: %u%%, overall progress: %u%%", dwProgressPercentage, dwOverallProgressPercentage);
#endif

		::StringCchPrintfW(wzProgress, countof(wzProgress), L"%u%%", dwOverallProgressPercentage);
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_PROGRESS_TEXT, wzProgress);

		ThemeSetProgressControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_PROGRESS_BAR, dwOverallProgressPercentage);
		SetTaskbarButtonProgress(dwOverallProgressPercentage);

		return __super::OnProgress(dwProgressPercentage, dwOverallProgressPercentage);
	}


	virtual STDMETHODIMP_(int) OnExecutePackageBegin(
		__in_z LPCWSTR wzPackageId,
		__in BOOL fExecute
		)
	{
		LPWSTR sczFormattedString = NULL;

		m_fStartedExecution = TRUE;

		if (wzPackageId && *wzPackageId)
		{
			BAL_INFO_PACKAGE* pPackage = NULL;
			BalInfoFindPackageById(&m_Bundle.packages, wzPackageId, &pPackage);

			LPCWSTR wz = wzPackageId;
			if (pPackage)
			{
				LOC_STRING* pLocString = NULL;

				switch (pPackage->type)
				{
				case BAL_INFO_PACKAGE_TYPE_BUNDLE_ADDON:
					LocGetString(m_pWixLoc, L"#(loc.ExecuteAddonRelatedBundleMessage)", &pLocString);
					break;

				case BAL_INFO_PACKAGE_TYPE_BUNDLE_PATCH:
					LocGetString(m_pWixLoc, L"#(loc.ExecutePatchRelatedBundleMessage)", &pLocString);
					break;

				case BAL_INFO_PACKAGE_TYPE_BUNDLE_UPGRADE:
					LocGetString(m_pWixLoc, L"#(loc.ExecuteUpgradeRelatedBundleMessage)", &pLocString);
					break;
				}

				if (pLocString)
				{
					BalFormatString(pLocString->wzText, &sczFormattedString);
				}

				wz = sczFormattedString ? sczFormattedString : pPackage->sczDisplayName ? pPackage->sczDisplayName : wzPackageId;
			}

			m_fShowingInternalUiThisPackage = pPackage && pPackage->fDisplayInternalUI;

			WCHAR wzInfo[1024] = { };
			if (m_fIsUninstall)
				::StringCchPrintfW(wzInfo, countof(wzInfo), L"Uninstalling %s...", wz);
			else
				::StringCchPrintfW(wzInfo, countof(wzInfo), L"Installing %s...", wz);

			ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_EXECUTE_PROGRESS_PACKAGE_TEXT, wz);
			ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_PROGRESS_PACKAGE_TEXT, wz);
		}
		else
		{
			m_fShowingInternalUiThisPackage = FALSE;
		}

		ReleaseStr(sczFormattedString);
		return __super::OnExecutePackageBegin(wzPackageId, fExecute);
	}

	virtual int __stdcall  OnExecuteProgress(
		__in_z LPCWSTR wzPackageId,
		__in DWORD dwProgressPercentage,
		__in DWORD dwOverallProgressPercentage
		)
	{
		WCHAR wzProgress[5] = { };

#ifdef DEBUG
		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "WIXSTDBA: OnExecuteProgress() - package: %ls, progress: %u%%, overall progress: %u%%", wzPackageId, dwProgressPercentage, dwOverallProgressPercentage);
#endif

		::StringCchPrintfW(wzProgress, countof(wzProgress), L"%u%%", dwOverallProgressPercentage);
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_EXECUTE_PROGRESS_TEXT, wzProgress);
		ThemeSetProgressControl(m_pTheme, WIXSTDBA_CONTROL_EXECUTE_PROGRESS_BAR, dwOverallProgressPercentage);

		BAL_INFO_PACKAGE* pPackage = NULL;
		HRESULT hr = BalInfoFindPackageById(&m_Bundle.packages, wzPackageId, &pPackage);
		LPCWSTR wzPackageName = (SUCCEEDED(hr) && pPackage->sczDisplayName) ? pPackage->sczDisplayName : wzPackageId;

		WCHAR wzInfo[1024] = { };
		if (m_fIsUninstall)
			::StringCchPrintfW(wzInfo, countof(wzInfo), L"Uninstalling %s...", wzPackageName, dwProgressPercentage);
		else
			::StringCchPrintfW(wzInfo, countof(wzInfo), L"Installing %s...", wzPackageName, dwProgressPercentage);
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_PROGRESS_PACKAGE_TEXT, wzInfo);

		m_dwCalculatedExecuteProgress = dwOverallProgressPercentage * (100 - WIXSTDBA_ACQUIRE_PERCENTAGE) / 100;
#ifdef DEBUG
		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "WIXSTDBA: OnExecuteProgress() - calculated progress: %u%%, displayed progress: %u%%", m_dwCalculatedExecuteProgress, m_dwCalculatedCacheProgress + m_dwCalculatedExecuteProgress);
#endif
		ThemeSetProgressControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_CALCULATED_PROGRESS_BAR, m_dwCalculatedCacheProgress + m_dwCalculatedExecuteProgress);

		SetTaskbarButtonProgress(m_dwCalculatedCacheProgress + m_dwCalculatedExecuteProgress);

		return __super::OnExecuteProgress(wzPackageId, dwProgressPercentage, dwOverallProgressPercentage);
	}


	virtual STDMETHODIMP_(int) OnExecutePackageComplete(
		__in_z LPCWSTR wzPackageId,
		__in HRESULT hrExitCode,
		__in BOOTSTRAPPER_APPLY_RESTART restart,
		__in int nRecommendation
		)
	{
		SetProgressState(hrExitCode);

		int nResult = __super::OnExecutePackageComplete(wzPackageId, hrExitCode, restart, nRecommendation);

		if (m_sczPrereqPackage && CSTR_EQUAL == ::CompareStringW(LOCALE_NEUTRAL, 0, wzPackageId, -1, m_sczPrereqPackage, -1))
		{
			m_fPrereqInstalled = SUCCEEDED(hrExitCode);

			// If the pre-req required a restart (any restart) then do an immediate
			// restart to ensure that the bundle will get launched again post reboot.
			if (BOOTSTRAPPER_APPLY_RESTART_NONE != restart)
			{
				nResult = IDRESTART;
			}
		}


		/// On package install complete, if WIXSTDBA_VARIABLE_LOGSPATH is defined
		/// then will move the package installation log to the specified path.
		if (BalStringVariableExists(WIXSTDBA_VARIABLE_LOGSPATH))
		{
			LPWSTR wzVarPackageLog = NULL;
			StrAllocFormatted(&wzVarPackageLog, L"WixBundleLog_%s", wzPackageId);
			if (BalStringVariableExists(wzVarPackageLog))
			{
				LPWSTR wzPackageLog = NULL;
				LPWSTR wzInstallLogPath = NULL;
				LPWSTR wzDstPackageLog = NULL;

				if ( SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_LOGSPATH, &wzInstallLogPath)) &&
					 SUCCEEDED(BalGetStringVariable(wzVarPackageLog, &wzPackageLog)))
				{
					StrAllocFormatted(&wzDstPackageLog, L"%s\\%s", wzInstallLogPath, PathFile(wzPackageLog));
					DirEnsureExists(wzInstallLogPath, NULL);
					FileEnsureMove(wzPackageLog, wzDstPackageLog, TRUE, TRUE);
				} else
					BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Setup was unable to copy logs to the specified installation log path.");

			}
		}

		return nResult;
	}


	virtual STDMETHODIMP_(void) OnExecuteComplete(
		__in HRESULT hrStatus
		)
	{
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_EXECUTE_PROGRESS_PACKAGE_TEXT, L"");
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_EXECUTE_PROGRESS_ACTIONDATA_TEXT, L"");
		ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_OVERALL_PROGRESS_PACKAGE_TEXT, L"");
		ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_PROGRESS_CANCEL_BUTTON, FALSE); // no more cancel.

		SetState(WIXSTDBA_STATE_EXECUTED, S_OK); // we always return success here and let OnApplyComplete() deal with the error.
		SetProgressState(hrStatus);
	}

	virtual STDMETHODIMP_(int) OnResolveSource(
		__in_z LPCWSTR wzPackageOrContainerId,
		__in_z_opt LPCWSTR wzPayloadId,
		__in_z LPCWSTR wzLocalSource,
		__in_z_opt LPCWSTR wzDownloadSource
		)
	{
		int nResult = IDERROR; // assume we won't resolve source and that is unexpected.

		if (BOOTSTRAPPER_DISPLAY_FULL == m_command.display)
		{
			if (wzDownloadSource)
			{
				nResult = IDDOWNLOAD;
			}
			else // prompt to change the source location.
			{
				OPENFILENAMEW ofn = { };
				WCHAR wzFile[MAX_PATH] = { };

				::StringCchCopyW(wzFile, countof(wzFile), wzLocalSource);

				ofn.lStructSize = sizeof(ofn);
				ofn.hwndOwner = m_hWnd;
				ofn.lpstrFile = wzFile;
				ofn.nMaxFile = countof(wzFile);
				ofn.lpstrFilter = L"All Files\0*.*\0";
				ofn.nFilterIndex = 1;
				ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST;
				ofn.lpstrTitle = m_pTheme->sczCaption;

				if (::GetOpenFileNameW(&ofn))
				{
					HRESULT hr = m_pEngine->SetLocalSource(wzPackageOrContainerId, wzPayloadId, ofn.lpstrFile);
					nResult = SUCCEEDED(hr) ? IDRETRY : IDERROR;
				}
				else
				{
					nResult = IDCANCEL;
				}
			}
		}
		else if (wzDownloadSource)
		{
			// If doing a non-interactive install and download source is available, let's try downloading the package silently
			nResult = IDDOWNLOAD;
		}
		// else there's nothing more we can do in non-interactive mode

		return CheckCanceled() ? IDCANCEL : nResult;
	}


	virtual STDMETHODIMP_(int) OnApplyComplete(
		__in HRESULT hrStatus,
		__in BOOTSTRAPPER_APPLY_RESTART restart
		)
	{
		m_restartResult = restart; // remember the restart result so we return the correct error code no matter what the user chooses to do in the UI.

		// If a restart was encountered and we are not suppressing restarts, then restart is required.
		m_fRestartRequired = (BOOTSTRAPPER_APPLY_RESTART_NONE != restart && BOOTSTRAPPER_RESTART_NEVER < m_command.restart);
		// If a restart is required and we're not displaying a UI or we are not supposed to prompt for restart then allow the restart.
		m_fAllowRestart = m_fRestartRequired && (BOOTSTRAPPER_DISPLAY_FULL > m_command.display || BOOTSTRAPPER_RESTART_PROMPT < m_command.restart);

		// If we are showing UI, wait a beat before moving to the final screen.
		if (BOOTSTRAPPER_DISPLAY_NONE < m_command.display)
		{
			::Sleep(250);
		}

		if (m_command.action == BOOTSTRAPPER_ACTION_UNINSTALL || BOOTSTRAPPER_DISPLAY_FULL > m_command.display)
			SetState(WIXSTDBA_STATE_APPLIED, S_OK);
		else
			SetState(WIXSTDBA_STATE_SVC_OPTIONS, hrStatus);

		// If we successfully applied an update close the window since the new Bundle should be running now.
		if (SUCCEEDED(hrStatus) && m_fUpdating)
		{
			BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Update downloaded, close bundle.");
			::PostMessageW(m_hWnd, WM_CLOSE, 0, 0);
		}

		return IDNOACTION;
	}


private: // privates
	//
	// UiThreadProc - entrypoint for UI thread.
	//
	static DWORD WINAPI UiThreadProc(
		__in LPVOID pvContext
		)
	{
		HRESULT hr = S_OK;
		CWixStandardBootstrapperApplication* pThis = (CWixStandardBootstrapperApplication*)pvContext;
		BOOL fComInitialized = FALSE;
		BOOL fRet = FALSE;
		MSG msg = { };

		// Initialize COM and theme.
		hr = ::CoInitialize(NULL);
		BalExitOnFailure(hr, "Failed to initialize COM.");
		fComInitialized = TRUE;

		hr = ThemeInitialize(pThis->m_hModule);
		BalExitOnFailure(hr, "Failed to initialize theme manager.");

		hr = pThis->InitializeData();
		BalExitOnFailure(hr, "Failed to initialize data in bootstrapper application.");


		// Create main window.
		pThis->InitializeTaskbarButton();
		hr = pThis->CreateMainWindow();
		BalExitOnFailure(hr, "Failed to create main window.");

		// Okay, we're ready for packages now.
		pThis->SetState(WIXSTDBA_STATE_INITIALIZED, hr);
		::PostMessageW(pThis->m_hWnd, BOOTSTRAPPER_ACTION_HELP == pThis->m_command.action ? WM_WIXSTDBA_SHOW_HELP : WM_WIXSTDBA_DETECT_PACKAGES, 0, 0);

		// message pump
		while (0 != (fRet = ::GetMessageW(&msg, NULL, 0, 0)))
		{
			if (-1 == fRet)
			{
				hr = E_UNEXPECTED;
				BalExitOnFailure(hr, "Unexpected return value from message pump.");
			}
			else if (!ThemeHandleKeyboardMessage(pThis->m_pTheme, msg.hwnd, &msg))
			{
				::TranslateMessage(&msg);
				::DispatchMessageW(&msg);
			}
		}

		// Succeeded thus far, check to see if anything went wrong while actually
		// executing changes.
		if (FAILED(pThis->m_hrFinal))
		{
			hr = pThis->m_hrFinal;
		}
		else if (pThis->CheckCanceled())
		{
			hr = HRESULT_FROM_WIN32(ERROR_INSTALL_USEREXIT);
		}

LExit:
		// destroy main window
		pThis->DestroyMainWindow();

		// initiate engine shutdown
		DWORD dwQuit = HRESULT_CODE(hr);
		if (BOOTSTRAPPER_APPLY_RESTART_INITIATED == pThis->m_restartResult)
		{
			dwQuit = ERROR_SUCCESS_REBOOT_INITIATED;
		}
		else if (BOOTSTRAPPER_APPLY_RESTART_REQUIRED == pThis->m_restartResult)
		{
			dwQuit = ERROR_SUCCESS_REBOOT_REQUIRED;
		}
		pThis->m_pEngine->Quit(dwQuit);

		ReleaseTheme(pThis->m_pTheme);
		ThemeUninitialize();

		// uninitialize COM
		if (fComInitialized)
		{
			::CoUninitialize();
		}

		return hr;
	}


	static DWORD WINAPI ThreadProc(
		__in LPVOID pvContext
		)
	{
		CWixStandardBootstrapperApplication* pThis = static_cast<CWixStandardBootstrapperApplication*>(pvContext);;

		HRESULT hr = S_OK;
		IXMLDOMDocument *pixd = NULL;
		IXMLDOMNode* pNode = NULL;
		LPWSTR sczUpdateUrl = NULL;
		DWORD64 qwSize = 0;

		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Checking for update.");

		// Load the update XML from a location url and parse it for an update.
		//
		// <?xml version="1.0" encoding="utf-8"?>
		// <Setup>
		//   <Upgrade Url="https://somewhere.co.uk/download/Setup.exe" Size="123" />
		// </Setup>

		hr = XmlLoadDocumentFromFile(pThis->m_wzUpdateLocation, &pixd);
		BalExitOnFailure(hr, "Failed to load version check XML document.");

		hr = XmlSelectSingleNode(pixd, L"/Setup/Upgrade", &pNode);
		BalExitOnFailure(hr, "Failed to select upgrade node.");

		if (S_OK == hr)
		{
			hr = XmlGetAttributeEx(pNode, L"Url", &sczUpdateUrl);
			BalExitOnFailure(hr, "Failed to get url attribute.");

			hr = XmlGetAttributeLargeNumber(pNode, L"Size", &qwSize);
		}

		if (sczUpdateUrl && *sczUpdateUrl)
		{
			BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Update available, url: %ls; size: %I64u.", sczUpdateUrl, qwSize);
			// Show upgrade on install and modify pages
			if (pThis->m_rgdwPageIds[WIXSTDBA_PAGE_INSTALL] == pThis->m_dwCurrentPage ||
				pThis->m_rgdwPageIds[WIXSTDBA_PAGE_MODIFY] == pThis->m_dwCurrentPage)
			{
				pThis->m_pEngine->SetUpdate(NULL, sczUpdateUrl, qwSize, BOOTSTRAPPER_UPDATE_HASH_TYPE_NONE, NULL, 0);
				ThemeControlEnable(pThis->m_pTheme, WIXSTDBA_CONTROL_UPGRADE_LINK, TRUE);
			}
		}
		else
		{
			BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "No update available.");
		}

LExit:
		ReleaseObject(pixd);
		ReleaseObject(pNode);
		ReleaseStr(sczUpdateUrl);

		return 0;
	}


	//
	// InitializeData - initializes all the package and prereq information.
	//
	HRESULT InitializeData()
	{
		HRESULT hr = S_OK;
		LPWSTR sczModulePath = NULL;
		IXMLDOMDocument *pixdManifest = NULL;

		hr = BalManifestLoad(m_hModule, &pixdManifest);
		BalExitOnFailure(hr, "Failed to load bootstrapper application manifest.");

		hr = ParseOverridableVariablesFromXml(pixdManifest);
		BalExitOnFailure(hr, "Failed to read overridable variables.");

		hr = ProcessCommandLine(&m_sczLanguage);
		ExitOnFailure(hr, "Unknown commandline parameters.");

		// Override default language to correctly support UK English (this is not required in WiX 3.8)
		if (!(m_sczLanguage && *m_sczLanguage))
		{
			hr = StrAllocFormatted(&m_sczLanguage, L"%u", ::GetUserDefaultLangID());
			BalExitOnFailure(hr, "Failed to set language.");
		}

		hr = PathRelativeToModule(&sczModulePath, NULL, m_hModule);
		BalExitOnFailure(hr, "Failed to get module path.");

		hr = LoadLocalization(sczModulePath, m_sczLanguage);
		ExitOnFailure(hr, "Failed to load localization.");

		hr = LoadTheme(sczModulePath, m_sczLanguage);
		ExitOnFailure(hr, "Failed to load theme.");

		hr = BalInfoParseFromXml(&m_Bundle, pixdManifest);
		BalExitOnFailure(hr, "Failed to load bundle information.");

		hr = BalConditionsParseFromXml(&m_Conditions, pixdManifest, m_pWixLoc);
		BalExitOnFailure(hr, "Failed to load conditions from XML.");

		LoadBootstrapperBAFunctions();

		hr = ParseBootrapperApplicationDataFromXml(pixdManifest);
		BalExitOnFailure(hr, "Failed to read bootstrapper application data.");

		LOC_STRING* pLocString = NULL;
		LocGetString(m_pWixLoc, L"#(loc.ProgressHeader)", &pLocString);
		m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_PROGRESS_HEADER, pLocString->wzText);
		LocGetString(m_pWixLoc, L"#(loc.ProgressInfo)", &pLocString);
		m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_PROGRESS_INFO, pLocString->wzText);
		LocGetString(m_pWixLoc, L"#(loc.SuccessHeader)", &pLocString);
		m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_SUCCESS_HEADER, pLocString->wzText);
		LocGetString(m_pWixLoc, L"#(loc.SuccessInfo)", &pLocString);
		m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_SUCCESS_INFO, pLocString->wzText);
		LocGetString(m_pWixLoc, L"#(loc.FailureHeader)", &pLocString);
		m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_FAILURE_HEADER, pLocString->wzText);
		if (m_fPrereq)
		{
			hr = ParsePrerequisiteInformationFromXml(pixdManifest);
			BalExitOnFailure(hr, "Failed to read prerequisite information.");
		}
		else
		{
			hr = ParseBootrapperApplicationDataFromXml(pixdManifest);
			BalExitOnFailure(hr, "Failed to read bootstrapper application data.");
		}

		if (m_fOutputToConsole)
		{
			BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Write to console command was detected! Trying to attach to the parent console process");
			BOOL bAttCons = AttachConsole(ATTACH_PARENT_PROCESS);

			if (!bAttCons)
			{
				BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Failed to attach to parent process.");
			}

			if (bAttCons)
			{
				BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Successfully attached to parent console process.");
				m_fStdConsoleHandle = GetStdHandle(STD_OUTPUT_HANDLE);
				m_fAttachedToConsole = ((m_fStdConsoleHandle != NULL) && (m_fStdConsoleHandle != INVALID_HANDLE_VALUE));
				if (!m_fAttachedToConsole)
				{
					BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Failed to get the console handle");
					FreeConsole();
				}
			}

			if (!m_fAttachedToConsole)
			{
				hr = E_UNEXPECTED;
				BalExitOnFailure(hr, "Failed to setup console output. Setup will exit now!");
			}
		}


LExit:
		ReleaseObject(pixdManifest);
		ReleaseStr(sczModulePath);

		return hr;
	}


	//
	// ProcessCommandLine - process the provided command line arguments.
	//
	HRESULT ProcessCommandLine(
		__inout LPWSTR* psczLanguage
		)
	{
		HRESULT hr = S_OK;
		int argc = 0;
		LPWSTR* argv = NULL;
		LPWSTR sczVariableName = NULL;
		LPWSTR sczVariableValue = NULL;

		if (m_command.wzCommandLine && *m_command.wzCommandLine)
		{
			argv = ::CommandLineToArgvW(m_command.wzCommandLine, &argc);
			ExitOnNullWithLastError(argv, hr, "Failed to get command line.");

			for (int i = 0; i < argc; ++i)
			{
				if (argv[i][0] == L'-' || argv[i][0] == L'/')
				{
					if (CSTR_EQUAL == ::CompareStringW(LOCALE_INVARIANT, NORM_IGNORECASE, &argv[i][1], -1, L"lang", -1))
					{
						if (i + 1 >= argc)
						{
							hr = E_INVALIDARG;
							BalExitOnFailure(hr, "Must specify a language.");
						}

						++i;

						hr = StrAllocString(psczLanguage, &argv[i][0], 0);
						BalExitOnFailure(hr, "Failed to copy language.");
					}
				}
				if (CSTR_EQUAL == ::CompareStringW(LOCALE_INVARIANT, NORM_IGNORECASE, &argv[i][1], -1, L"toconsole", -1))
				{
					m_fOutputToConsole = TRUE;
					m_command.display = BOOTSTRAPPER_DISPLAY_NONE;
					if (BOOTSTRAPPER_RESTART_UNKNOWN == m_command.restart)
					{
						m_command.restart = BOOTSTRAPPER_RESTART_AUTOMATIC;
					}
				}
				else if (m_sdOverridableVariables)
				{
					const wchar_t* pwc = wcschr(argv[i], L'=');
					if (pwc)
					{
						hr = StrAllocString(&sczVariableName, argv[i], pwc - argv[i]);
						BalExitOnFailure(hr, "Failed to copy variable name.");

						hr = DictKeyExists(m_sdOverridableVariables, sczVariableName);
						if (E_NOTFOUND == hr)
						{
							BalLog(BOOTSTRAPPER_LOG_LEVEL_ERROR, "Ignoring attempt to set non-overridable variable: '%ls'.", sczVariableName);
							hr = S_OK;
							continue;
						}
						ExitOnFailure(hr, "Failed to check the dictionary of overridable variables.");

						hr = StrAllocString(&sczVariableValue, ++pwc, 0);
						BalExitOnFailure(hr, "Failed to copy variable value.");

						hr = m_pEngine->SetVariableString(sczVariableName, sczVariableValue);
						BalExitOnFailure(hr, "Failed to set variable.");
					}
					else
					{
						BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Ignoring unknown argument: %ls", argv[i]);
					}
				}
			}
		}

LExit:
		if (argv)
		{
			::LocalFree(argv);
		}

		ReleaseStr(sczVariableName);
		ReleaseStr(sczVariableValue);

		return hr;
	}

	HRESULT LoadLocalization(
		__in_z LPCWSTR wzModulePath,
		__in_z_opt LPCWSTR wzLanguage
		)
	{
		HRESULT hr = S_OK;
		LPWSTR sczLocPath = NULL;
		LPCWSTR wzLocFileName = L"thm.wxl";

		hr = LocProbeForFile(wzModulePath, wzLocFileName, wzLanguage, &sczLocPath);
		BalExitOnFailure2(hr, "Failed to probe for loc file: %ls in path: %ls", wzLocFileName, wzModulePath);

		hr = LocLoadFromFile(sczLocPath, &m_pWixLoc);
		BalExitOnFailure1(hr, "Failed to load loc file from path: %ls", sczLocPath);

		if (WIX_LOCALIZATION_LANGUAGE_NOT_SET != m_pWixLoc->dwLangId)
		{
			::SetThreadLocale(m_pWixLoc->dwLangId);
		}

		hr = StrAllocString(&m_sczConfirmCloseMessage, L"#(loc.ConfirmCancelMessage)", 0);
		ExitOnFailure(hr, "Failed to initialize confirm message loc identifier.");

		hr = LocLocalizeString(m_pWixLoc, &m_sczConfirmCloseMessage);
		BalExitOnFailure1(hr, "Failed to localize confirm close message: %ls", m_sczConfirmCloseMessage);

LExit:
		ReleaseStr(sczLocPath);

		return hr;
	}


	HRESULT LoadTheme(
		__in_z LPCWSTR wzModulePath,
		__in_z_opt LPCWSTR wzLanguage
		)
	{
		HRESULT hr = S_OK;
		LPWSTR sczThemePath = NULL;
		LPCWSTR wzThemeFileName = L"thm.xml";
		LPWSTR sczCaption = NULL;

		hr = LocProbeForFile(wzModulePath, wzThemeFileName, wzLanguage, &sczThemePath);
		BalExitOnFailure2(hr, "Failed to probe for theme file: %ls in path: %ls", wzThemeFileName, wzModulePath);

		hr = ThemeLoadFromFile(sczThemePath, &m_pTheme);
		BalExitOnFailure1(hr, "Failed to load theme from path: %ls", sczThemePath);

		hr = ThemeLocalize(m_pTheme, m_pWixLoc);
		BalExitOnFailure1(hr, "Failed to localize theme: %ls", sczThemePath);

		// Update the caption if there are any formatted strings in it.
		hr = BalFormatString(m_pTheme->sczCaption, &sczCaption);
		if (SUCCEEDED(hr))
		{
			ThemeUpdateCaption(m_pTheme, sczCaption);
		}

LExit:
		ReleaseStr(sczCaption);
		ReleaseStr(sczThemePath);

		return hr;
	}


	HRESULT ParseOverridableVariablesFromXml(
		__in IXMLDOMDocument* pixdManifest
		)
	{
		HRESULT hr = S_OK;
		IXMLDOMNode* pNode = NULL;
		IXMLDOMNodeList* pNodes = NULL;
		DWORD cNodes = 0;
		LPWSTR scz = NULL;

		// get the list of variables users can override on the command line
		hr = XmlSelectNodes(pixdManifest, L"/BootstrapperApplicationData/WixStdbaOverridableVariable", &pNodes);
		if (S_FALSE == hr)
		{
			ExitFunction1(hr = S_OK);
		}
		ExitOnFailure(hr, "Failed to select overridable variable nodes.");

		hr = pNodes->get_length((long*)&cNodes);
		ExitOnFailure(hr, "Failed to get overridable variable node count.");

		if (cNodes)
		{
			hr = DictCreateStringList(&m_sdOverridableVariables, 32, DICT_FLAG_NONE);
			ExitOnFailure(hr, "Failed to create the string dictionary.");

			for (DWORD i = 0; i < cNodes; ++i)
			{
				hr = XmlNextElement(pNodes, &pNode, NULL);
				ExitOnFailure(hr, "Failed to get next node.");

				// @Name
				hr = XmlGetAttributeEx(pNode, L"Name", &scz);
				ExitOnFailure(hr, "Failed to get @Name.");

				hr = DictAddKey(m_sdOverridableVariables, scz);
				ExitOnFailure1(hr, "Failed to add \"%ls\" to the string dictionary.", scz);

				// prepare next iteration
				ReleaseNullObject(pNode);
			}
		}

LExit:
		ReleaseObject(pNode);
		ReleaseObject(pNodes);
		ReleaseStr(scz);
		return hr;
	}


	HRESULT ParsePrerequisiteInformationFromXml(
		__in IXMLDOMDocument* pixdManifest
		)
	{
		HRESULT hr = S_OK;
		IXMLDOMNode* pNode = NULL;

		hr = XmlSelectSingleNode(pixdManifest, L"/BootstrapperApplicationData/WixMbaPrereqInformation", &pNode);
		if (S_FALSE == hr)
		{
			hr = E_INVALIDARG;
		}
		BalExitOnFailure(hr, "BootstrapperApplication.xml manifest is missing prerequisite information.");

		hr = XmlGetAttributeEx(pNode, L"PackageId", &m_sczPrereqPackage);
		BalExitOnFailure(hr, "Failed to get prerequisite package identifier.");

		hr = XmlGetAttributeEx(pNode, L"LicenseUrl", &m_sczLicenseUrl);
		if (E_NOTFOUND == hr)
		{
			hr = S_OK;
		}
		BalExitOnFailure(hr, "Failed to get prerequisite license URL.");

		hr = XmlGetAttributeEx(pNode, L"LicenseFile", &m_sczLicenseFile);
		if (E_NOTFOUND == hr)
		{
			hr = S_OK;
		}
		BalExitOnFailure(hr, "Failed to get prerequisite license file.");

LExit:
		ReleaseObject(pNode);
		return hr;
	}


	HRESULT ParseBootrapperApplicationDataFromXml(
		__in IXMLDOMDocument* pixdManifest
		)
	{
		HRESULT hr = S_OK;
		IXMLDOMNode* pNode = NULL;
		DWORD dwBool = 0;

		hr = XmlSelectSingleNode(pixdManifest, L"/BootstrapperApplicationData/WixExtbaInformation", &pNode);
		if (S_FALSE == hr)
		{
			hr = E_INVALIDARG;
		}
		BalExitOnFailure(hr, "BootstrapperApplication.xml manifest is missing wixextba information.");

		hr = XmlGetAttributeEx(pNode, L"LicenseFile", &m_sczLicenseFile);
		if (E_NOTFOUND == hr)
		{
			hr = S_OK;
		}
		BalExitOnFailure(hr, "Failed to get license file.");

		hr = XmlGetAttributeEx(pNode, L"LicenseUrl", &m_sczLicenseUrl);
		if (E_NOTFOUND == hr)
		{
			hr = S_OK;
		}
		BalExitOnFailure(hr, "Failed to get license URL.");

		ReleaseObject(pNode);

		hr = XmlSelectSingleNode(pixdManifest, L"/BootstrapperApplicationData/WixExtbaOptions", &pNode);
		if (S_FALSE == hr)
		{
			ExitFunction1(hr = S_OK);
		}
		BalExitOnFailure(hr, "Failed to read wixextba options from BootstrapperApplication.xml manifest.");

		hr = XmlGetAttributeNumber(pNode, L"SuppressOptionsUI", &dwBool);
		if (E_NOTFOUND == hr)
		{
			hr = S_OK;
		}
		else if (SUCCEEDED(hr))
		{
			m_fSuppressOptionsUI = 0 < dwBool;
		}
		BalExitOnFailure(hr, "Failed to get SuppressOptionsUI value.");

		dwBool = 0;
		hr = XmlGetAttributeNumber(pNode, L"SuppressDowngradeFailure", &dwBool);
		if (E_NOTFOUND == hr)
		{
			hr = S_OK;
		}
		else if (SUCCEEDED(hr))
		{
			m_fSuppressDowngradeFailure = 0 < dwBool;
		}
		BalExitOnFailure(hr, "Failed to get SuppressDowngradeFailure value.");

		dwBool = 0;
		hr = XmlGetAttributeNumber(pNode, L"SuppressRepair", &dwBool);
		if (E_NOTFOUND == hr)
		{
			hr = S_OK;
		}
		else if (SUCCEEDED(hr))
		{
			m_fSuppressRepair = 0 < dwBool;
		}
		BalExitOnFailure(hr, "Failed to get SuppressRepair value.");

		hr = XmlGetAttributeNumber(pNode, L"ShowVersion", &dwBool);
		if (E_NOTFOUND == hr)
		{
			hr = S_OK;
		}
		else if (SUCCEEDED(hr))
		{
			m_fShowVersion = 0 < dwBool;
		}
		BalExitOnFailure(hr, "Failed to get ShowVersion value.");

LExit:
		ReleaseObject(pNode);
		return hr;
	}


	//
	// CreateMainWindow - creates the main install window.
	//
	HRESULT CreateMainWindow()
	{
		HRESULT hr = S_OK;
		HICON hIcon = reinterpret_cast<HICON>(m_pTheme->hIcon);
		WNDCLASSW wc = { };
		DWORD dwWindowStyle = 0;
		int x = CW_USEDEFAULT;
		int y = CW_USEDEFAULT;
		POINT ptCursor = { };
		HMONITOR hMonitor = NULL;
		MONITORINFO mi = { };

		// If the theme did not provide an icon, try using the icon from the bundle engine.
		if (!hIcon)
		{
			HMODULE hBootstrapperEngine = ::GetModuleHandleW(NULL);
			if (hBootstrapperEngine)
			{
				hIcon = ::LoadIconW(hBootstrapperEngine, MAKEINTRESOURCEW(1));
			}
		}

		// Register the window class and create the window.
		wc.lpfnWndProc = CWixStandardBootstrapperApplication::WndProc;
		wc.hInstance = m_hModule;
		wc.hIcon = hIcon;
		wc.hCursor = ::LoadCursorW(NULL, (LPCWSTR)IDC_ARROW);
		wc.hbrBackground = m_pTheme->rgFonts[m_pTheme->dwFontId].hBackground;
		wc.lpszMenuName = NULL;
		wc.lpszClassName = WIXSTDBA_WINDOW_CLASS;
		if (!::RegisterClassW(&wc))
		{
			ExitWithLastError(hr, "Failed to register window.");
		}

		m_fRegistered = TRUE;

		// Calculate the window style based on the theme style and command display value.
		dwWindowStyle = m_pTheme->dwStyle;
		if (BOOTSTRAPPER_DISPLAY_NONE >= m_command.display)
		{
			dwWindowStyle &= ~WS_VISIBLE;
		}

		// Don't show the window if there is a splash screen (it will be made visible when the splash screen is hidden)
		if (::IsWindow(m_command.hwndSplashScreen))
		{
			dwWindowStyle &= ~WS_VISIBLE;
		}

		// Center the window on the monitor with the mouse.
		if (::GetCursorPos(&ptCursor))
		{
			hMonitor = ::MonitorFromPoint(ptCursor, MONITOR_DEFAULTTONEAREST);
			if (hMonitor)
			{
				mi.cbSize = sizeof(mi);
				if (::GetMonitorInfoW(hMonitor, &mi))
				{
					x = mi.rcWork.left + (mi.rcWork.right  - mi.rcWork.left - m_pTheme->nWidth) / 2;
					y = mi.rcWork.top  + (mi.rcWork.bottom - mi.rcWork.top  - m_pTheme->nHeight) / 2;
				}
			}
		}

		m_hWnd = ::CreateWindowExW(0, wc.lpszClassName, m_pTheme->sczCaption, dwWindowStyle, x, y, m_pTheme->nWidth, m_pTheme->nHeight, HWND_DESKTOP, NULL, m_hModule, this);
		ExitOnNullWithLastError(m_hWnd, hr, "Failed to create window.");

		hr = S_OK;

LExit:
		return hr;
	}


	//
	// InitializeTaskbarButton - initializes taskbar button for progress.
	//
	void InitializeTaskbarButton()
	{
		HRESULT hr = S_OK;

		hr = ::CoCreateInstance(CLSID_TaskbarList, NULL, CLSCTX_ALL, __uuidof(ITaskbarList3), reinterpret_cast<LPVOID*>(&m_pTaskbarList));
		if (REGDB_E_CLASSNOTREG == hr) // not supported before Windows 7
		{
			ExitFunction1(hr = S_OK);
		}
		BalExitOnFailure(hr, "Failed to create ITaskbarList3. Continuing.");

		m_uTaskbarButtonCreatedMessage = ::RegisterWindowMessageW(L"TaskbarButtonCreated");
		BalExitOnNullWithLastError(m_uTaskbarButtonCreatedMessage, hr, "Failed to get TaskbarButtonCreated message. Continuing.");

LExit:
		return;
	}

	//
	// DestroyMainWindow - clean up all the window registration.
	//
	void DestroyMainWindow()
	{
		if (::IsWindow(m_hWnd))
		{
			::DestroyWindow(m_hWnd);
			m_hWnd = NULL;
			m_fTaskbarButtonOK = FALSE;
		}

		if (m_fRegistered)
		{
			::UnregisterClassW(WIXSTDBA_WINDOW_CLASS, m_hModule);
			m_fRegistered = FALSE;
		}
	}


	//
	// WndProc - standard windows message handler.
	//
	static LRESULT CALLBACK WndProc(
		__in HWND hWnd,
		__in UINT uMsg,
		__in WPARAM wParam,
		__in LPARAM lParam
		)
	{
#pragma warning(suppress:4312)
		CWixStandardBootstrapperApplication* pBA = reinterpret_cast<CWixStandardBootstrapperApplication*>(::GetWindowLongPtrW(hWnd, GWLP_USERDATA));

		switch (uMsg)
		{
		case WM_NCCREATE:
			{
				LPCREATESTRUCT lpcs = reinterpret_cast<LPCREATESTRUCT>(lParam);
				pBA = reinterpret_cast<CWixStandardBootstrapperApplication*>(lpcs->lpCreateParams);
#pragma warning(suppress:4244)
				::SetWindowLongPtrW(hWnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(pBA));
			}
			break;

		case WM_NCDESTROY:
			{
				LRESULT lres = ThemeDefWindowProc(pBA ? pBA->m_pTheme : NULL, hWnd, uMsg, wParam, lParam);
				::SetWindowLongPtrW(hWnd, GWLP_USERDATA, 0);
				return lres;
			}

		case WM_CREATE:
			if (!pBA->OnCreate(hWnd))
			{
				return -1;
			}
			break;

		case WM_QUERYENDSESSION:
			return IDCANCEL != pBA->OnSystemShutdown(static_cast<DWORD>(lParam), IDCANCEL);

		case WM_CLOSE:
			// If the user chose not to close, do *not* let the default window proc handle the message.
			if (!pBA->OnClose())
			{
				return 0;
			}
			break;

		case WM_DESTROY:
			::PostQuitMessage(0);
			break;

		case WM_WIXSTDBA_SHOW_HELP:
			pBA->OnShowHelp();
			return 0;

		case WM_WIXSTDBA_DETECT_PACKAGES:
			pBA->OnDetect();
			return 0;

		case WM_WIXSTDBA_PLAN_PACKAGES:
			pBA->OnPlan(static_cast<BOOTSTRAPPER_ACTION>(lParam));
			return 0;

		case WM_WIXSTDBA_APPLY_PACKAGES:
			pBA->OnApply();
			return 0;

		case WM_WIXSTDBA_CHANGE_STATE:
			pBA->OnChangeState(static_cast<WIXSTDBA_STATE>(lParam));
			return 0;

		case WM_COMMAND:
			switch (LOWORD(wParam))
			{
			case WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX:
				pBA->OnClickAcceptCheckbox();
				return 0;

			case WIXSTDBA_CONTROL_PERMACHINE_RADIO: __fallthrough;
			case WIXSTDBA_CONTROL_PERUSER_RADIO:
				pBA->OnClickInstallScope();
				return 0;

			case WIXSTDBA_CONTROL_REGSIGNIN_RADIO: __fallthrough;
			case WIXSTDBA_CONTROL_REGCREATE_RADIO: __fallthrough;
			case WIXSTDBA_CONTROL_SKIPREG_CHECKBOX:
				pBA->OnClickSkipRegistrationCheckbox();
				return 0;


			case WIXSTDBA_CONTROL_OPTIONS_BUTTON:
				pBA->OnClickOptionsButton();
				return 0;

			case WIXSTDBA_CONTROL_BROWSE_BUTTON:
				pBA->OnClickOptionsBrowseButton(WIXSTDBA_CONTROL_BROWSE_BUTTON);
				return 0;

			case WIXSTDBA_CONTROL_OK_BUTTON:
				pBA->OnClickOptionsOkButton();
				return 0;

			case WIXSTDBA_CONTROL_CANCEL_BUTTON:
				pBA->OnClickOptionsCancelButton();
				return 0;

			case WIXSTDBA_CONTROL_SKIP_BUTTON:
 				pBA->SetState(WIXSTDBA_STATE_APPLIED, S_OK);
				return 0;

			case WIXSTDBA_CONTROL_INSTALL_BUTTON:
				pBA->OnSignIn();
				return 0;

			case WIXSTDBA_CONTROL_REPAIR_BUTTON:
				pBA->OnClickRepairButton();
				return 0;

			case WIXSTDBA_CONTROL_UNINSTALL_BUTTON:
				pBA->OnClickUninstallButton();
				return 0;

			case WIXSTDBA_CONTROL_LAUNCH_BUTTON:
				pBA->OnClickLaunchButton();
				return 0;

			case WIXSTDBA_CONTROL_SUCCESS_RESTART_BUTTON: __fallthrough;
			case WIXSTDBA_CONTROL_FAILURE_RESTART_BUTTON:
				pBA->OnClickRestartButton();
				return 0;

			case WIXSTDBA_CONTROL_HELP_CANCEL_BUTTON: __fallthrough;

			case WIXSTDBA_CONTROL_WELCOME_CANCEL_BUTTON: __fallthrough;
			case WIXSTDBA_CONTROL_MODIFY_CANCEL_BUTTON: __fallthrough;
			case WIXSTDBA_CONTROL_PROGRESS_CANCEL_BUTTON: __fallthrough;
			case WIXSTDBA_CONTROL_SUCCESS_CANCEL_BUTTON: __fallthrough;
			case WIXSTDBA_CONTROL_FAILURE_CANCEL_BUTTON: __fallthrough;
			case WIXSTDBA_CONTROL_CLOSE_BUTTON:
				pBA->OnClickCloseButton();
				return 0;
			case WIXSTDBA_CONTROL_NEXT_BUTTON:
				pBA->OnClickNextButton();
				return 0;
			case WIXSTDBA_CONTROL_BACK_BUTTON:
				pBA->OnClickBackButton();
				return 0;

			}
			break;

		case WM_NOTIFY:
			if (lParam)
			{
				LPNMHDR pnmhdr = reinterpret_cast<LPNMHDR>(lParam);
				switch (pnmhdr->code)
				{
				case NM_CLICK: __fallthrough;
				case NM_RETURN:
					switch (static_cast<DWORD>(pnmhdr->idFrom))
					{
					case WIXSTDBA_CONTROL_EULA_LINK:
						pBA->OnClickEulaLink();
						return 1;
					case WIXSTDBA_CONTROL_FAILURE_LOGFILE_LINK:
						pBA->OnClickLogFileLink();
						return 1;
					case WIXSTDBA_CONTROL_UPGRADE_LINK:
						pBA->OnClickUpgradeLink();
						return 1;
					}
				}
			}
			break;
		}

		if (pBA && pBA->m_pTaskbarList && uMsg == pBA->m_uTaskbarButtonCreatedMessage)
		{
			pBA->m_fTaskbarButtonOK = TRUE;
			return 0;
		}

		return ThemeDefWindowProc(pBA ? pBA->m_pTheme : NULL, hWnd, uMsg, wParam, lParam);
	}


	//
	// OnCreate - finishes loading the theme.
	//
	BOOL OnCreate(
		__in HWND hWnd
		)
	{
		HRESULT hr = S_OK;
		LPWSTR sczText = NULL;
		LPWSTR sczLicenseFormatted = NULL;
		LPWSTR sczLicensePath = NULL;
		LPWSTR sczLicenseDirectory = NULL;
		LPWSTR sczLicenseFilename = NULL;

		hr = ThemeLoadControls(m_pTheme, hWnd, vrgInitControls, countof(vrgInitControls));
		BalExitOnFailure(hr, "Failed to load theme controls.");

		C_ASSERT(COUNT_WIXSTDBA_PAGE == countof(vrgwzPageNames));
		C_ASSERT(countof(m_rgdwPageIds) == countof(vrgwzPageNames));

		ThemeGetPageIds(m_pTheme, vrgwzPageNames, m_rgdwPageIds, countof(m_rgdwPageIds));

		// Initialize the text on all "application" (non-page) controls.
		for (DWORD i = 0; i < m_pTheme->cControls; ++i)
		{
			THEME_CONTROL* pControl = m_pTheme->rgControls + i;
			if (!pControl->wPageId && pControl->sczText && *pControl->sczText)
			{
				HRESULT hrFormat = BalFormatString(pControl->sczText, &sczText);
				if (SUCCEEDED(hrFormat))
				{
					ThemeSetTextControl(m_pTheme, pControl->wId, sczText);
				}
			}
		}

		// Load the RTF EULA control with text if the control exists.
		if (ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_EULA_RICHEDIT))
		{
			hr = (m_sczLicenseFile && *m_sczLicenseFile) ? S_OK : E_INVALIDDATA;
			if (SUCCEEDED(hr))
			{
				hr = StrAllocString(&sczLicenseFormatted, m_sczLicenseFile, 0);
				if (SUCCEEDED(hr))
				{
					hr = LocLocalizeString(m_pWixLoc, &sczLicenseFormatted);
					if (SUCCEEDED(hr))
					{
						hr = BalFormatString(sczLicenseFormatted, &sczLicenseFormatted);
						if (SUCCEEDED(hr))
						{
							hr = PathRelativeToModule(&sczLicensePath, sczLicenseFormatted, m_hModule);
							if (SUCCEEDED(hr))
							{
								hr = PathGetDirectory(sczLicensePath, &sczLicenseDirectory);
								if (SUCCEEDED(hr))
								{
									hr = StrAllocString(&sczLicenseFilename, PathFile(sczLicenseFormatted), 0);
									if (SUCCEEDED(hr))
									{
										hr = LocProbeForFile(sczLicenseDirectory, sczLicenseFilename, m_sczLanguage, &sczLicensePath);
										if (SUCCEEDED(hr))
										{
											hr = ThemeLoadRichEditFromFile(m_pTheme, WIXSTDBA_CONTROL_EULA_RICHEDIT, sczLicensePath, m_hModule);
										}
									}
								}
							}
						}
					}
				}
			}

			if (FAILED(hr))
			{
				BalLog(BOOTSTRAPPER_LOG_LEVEL_ERROR, "Failed to load file into license richedit control from path '%ls' manifest value: %ls", sczLicensePath, m_sczLicenseFile);
				hr = S_OK;
			}
		}

LExit:
		ReleaseStr(sczLicenseFilename);
		ReleaseStr(sczLicenseDirectory);
		ReleaseStr(sczLicensePath);
		ReleaseStr(sczLicenseFormatted);
		ReleaseStr(sczText);

		return SUCCEEDED(hr);
	}


	//
	// OnShowHelp - display the help page.
	//
	void OnShowHelp()
	{
		SetState(WIXSTDBA_STATE_HELP, S_OK);

		// If the UI should be visible, display it now and hide the splash screen
		if (BOOTSTRAPPER_DISPLAY_NONE < m_command.display)
		{
			::ShowWindow(m_pTheme->hwndParent, SW_SHOW);
		}

		m_pEngine->CloseSplashScreen();

		return;
	}


	//
	// OnDetect - start the processing of packages.
	//
	void OnDetect()
	{
		HRESULT hr = S_OK;

		if (m_pBAFunction)
		{
			hr = m_pBAFunction->OnDetect();
			BalExitOnFailure(hr, "Failed calling detect BA function.");
		}

		SetState(WIXSTDBA_STATE_DETECTING, hr);

		// If the UI should be visible, display it now and hide the splash screen
		if (BOOTSTRAPPER_DISPLAY_NONE < m_command.display)
		{
			::ShowWindow(m_pTheme->hwndParent, SW_SHOW);
		}

		m_pEngine->CloseSplashScreen();

		// Tell the core we're ready for the packages to be processed now.
		hr = m_pEngine->Detect();
		BalExitOnFailure(hr, "Failed to start detecting chain.");

LExit:
		if (FAILED(hr))
		{
			SetState(WIXSTDBA_STATE_DETECTING, hr);
		}

		return;
	}


	//
	// OnPlan - plan the detected changes.
	//
	void OnPlan(
		__in BOOTSTRAPPER_ACTION action
		)
	{
		HRESULT hr = S_OK;

		m_plannedAction = action;

		LOC_STRING* pLocString = NULL;

		if (m_plannedAction == BOOTSTRAPPER_ACTION_UNINSTALL)
		{
			m_fIsUninstall = TRUE;
			LocGetString(m_pWixLoc, L"#(loc.ProgressHeaderUninstall)", &pLocString);
			m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_PROGRESS_HEADER, pLocString->wzText);
			LocGetString(m_pWixLoc, L"#(loc.ProgressInfoUninstall)", &pLocString);
			m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_PROGRESS_INFO, pLocString->wzText);
		}

		if (m_plannedAction == BOOTSTRAPPER_ACTION_REPAIR)
		{
			m_fIsRepair = TRUE;
			LocGetString(m_pWixLoc, L"#(loc.ProgressHeaderRepair)", &pLocString);
			m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_PROGRESS_HEADER, pLocString->wzText);
			LocGetString(m_pWixLoc, L"#(loc.ProgressInfoRepair)", &pLocString);
			m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_PROGRESS_INFO, pLocString->wzText);
		}

		// If we are going to apply a downgrade, bail.
		if (m_fDowngrading && BOOTSTRAPPER_ACTION_UNINSTALL < action)
		{
			if (m_fSuppressDowngradeFailure)
			{
				BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "A newer version of this product is installed but downgrade failure has been suppressed; continuing...");
			}
			else
			{
				hr = HRESULT_FROM_WIN32(ERROR_PRODUCT_VERSION);
				BalExitOnFailure(hr, "Cannot install a product when a newer version is installed.");
			}
		}

		SetState(WIXSTDBA_STATE_PLANNING, hr);

		if (m_pBAFunction)
		{
			m_pBAFunction->OnPlan();
		}

		hr = m_pEngine->Plan(action);
		BalExitOnFailure(hr, "Failed to start planning packages.");

LExit:
		if (FAILED(hr))
		{
			SetState(WIXSTDBA_STATE_PLANNING, hr);
		}

		return;
	}


	//
	// OnApply - apply the packages.
	//
	void OnApply()
	{
		HRESULT hr = S_OK;

		SetState(WIXSTDBA_STATE_APPLYING, hr);
		SetProgressState(hr);

		if (m_fAttachedToConsole)
		{
			char *szPgLine;
			if (m_fIsUninstall) {
				szPgLine = "\nInstalling...\n";
			} else {
				szPgLine = "\nUninstalling...\n";
			}
			DWORD dSzWritten;
			WriteConsole(m_fStdConsoleHandle, szPgLine, strlen(szPgLine), &dSzWritten, NULL);
		}
		SetTaskbarButtonProgress(0);

		hr = m_pEngine->Apply(m_hWnd);
		BalExitOnFailure(hr, "Failed to start applying packages.");

		ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_PROGRESS_CANCEL_BUTTON, TRUE); // ensure the cancel button is enabled before starting.

LExit:
		if (FAILED(hr))
		{
			SetState(WIXSTDBA_STATE_APPLYING, hr);
		}

		return;
	}


	//
	// OnChangeState - change state.
	//
	void OnChangeState(
		__in WIXSTDBA_STATE state
		)
	{
		WIXSTDBA_STATE stateOld = m_state;
		DWORD dwOldPageId = 0;
		DWORD dwNewPageId = 0;
		LPWSTR sczText = NULL;
		LPWSTR sczUnformattedText = NULL;
		LPWSTR sczControlState = NULL;
		LPWSTR sczControlName = NULL;
		LOC_STRING* pLocString = NULL;
		m_state = state;

		// If our install is at the end (success or failure) and we're not showing full UI or
		// we successfully installed the prerequisite then exit (prompt for restart if required).
		if ((WIXSTDBA_STATE_APPLIED <= m_state && BOOTSTRAPPER_DISPLAY_FULL > m_command.display) ||
			(WIXSTDBA_STATE_APPLIED == m_state && m_fPrereq))
		{
			// If a restart was required but we were not automatically allowed to
			// accept the reboot then do the prompt.
			if (m_fRestartRequired && !m_fAllowRestart)
			{
				StrAllocFromError(&sczUnformattedText, HRESULT_FROM_WIN32(ERROR_SUCCESS_REBOOT_REQUIRED), NULL);

				int nResult = ::MessageBoxW(m_hWnd, sczUnformattedText ? sczUnformattedText : L"The requested operation is successful. Changes will not be effective until the system is rebooted.", m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_OKCANCEL);
				m_fAllowRestart = (IDOK == nResult);
			}

			// Quietly exit.
			::PostMessageW(m_hWnd, WM_CLOSE, 0, 0);
		}
		else // try to change the pages.
		{
			DeterminePageId(stateOld, &dwOldPageId);
			DeterminePageId(m_state, &dwNewPageId);

			if (dwOldPageId != dwNewPageId)
			{
				// Enable disable controls per-page.
				if (m_rgdwPageIds[WIXSTDBA_PAGE_INSTALL] == dwNewPageId) // on the "Install" page, ensure the install button is enabled/disabled correctly.
				{
					LONGLONG llElevated = 0;
					if (m_Bundle.fPerMachine)
					{
						BalGetNumericVariable(WIXBUNDLE_VARIABLE_ELEVATED, &llElevated);
					}
					ThemeControlElevates(m_pTheme, WIXSTDBA_CONTROL_INSTALL_BUTTON, (m_Bundle.fPerMachine && !llElevated));

					// If the EULA control exists, show it only if a license URL is provided as well.
					if (ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_EULA_LINK))
					{
						BOOL fEulaLink = (m_sczLicenseUrl && *m_sczLicenseUrl);
						ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_EULA_LINK, fEulaLink);
						ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX, fEulaLink);
					}

					BOOL fAcceptedLicense = !ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX) || !ThemeControlEnabled(m_pTheme, WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX) || ThemeIsControlChecked(m_pTheme, WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX);
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_INSTALL_BUTTON, fAcceptedLicense);
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_NEXT_BUTTON, fAcceptedLicense);

					// If there is an "Options" page, the "Options" button exists, and it hasn't been suppressed, then enable the button.
					BOOL fOptionsEnabled = m_rgdwPageIds[WIXSTDBA_PAGE_INSTALLDIR] && ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_OPTIONS_BUTTON) && !m_fSuppressOptionsUI;
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_OPTIONS_BUTTON, fOptionsEnabled);

					// Show/Hide the version label if it exists.
					if (m_rgdwPageIds[WIXSTDBA_PAGE_INSTALLDIR] && ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_VERSION_LABEL) && !m_fShowVersion)
					{
						ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_VERSION_LABEL, SW_HIDE);
					}
				}
				else if (m_rgdwPageIds[WIXSTDBA_PAGE_MODIFY] == dwNewPageId)
				{
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_REPAIR_BUTTON, !m_fSuppressRepair);
				}
				else if (m_rgdwPageIds[WIXSTDBA_PAGE_INSTALLDIR] == dwNewPageId)
				{
					HRESULT hr = BalGetStringVariable(WIXSTDBA_VARIABLE_INSTALL_FOLDER, &sczUnformattedText);
					if (SUCCEEDED(hr))
					{
						BalFormatString(sczUnformattedText, &sczText);
						ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX, sczText);
					}
				}
				else if (m_rgdwPageIds[WIXSTDBA_PAGE_SUCCESS] == dwNewPageId) // on the "Success" page, check if the restart or launch button should be enabled.
				{
					BOOL fShowRestartButton = FALSE;
					BOOL fLaunchTargetExists = FALSE;

					if (m_fIsRepair)
					{
						LocGetString(m_pWixLoc, L"#(loc.SuccessHeaderRepair)", &pLocString);
						m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_SUCCESS_HEADER, pLocString->wzText);
						LocGetString(m_pWixLoc, L"#(loc.SuccessInfoRepair)", &pLocString);
						m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_SUCCESS_INFO, pLocString->wzText);
					}
					else if (m_fIsUninstall)
					{
						LocGetString(m_pWixLoc, L"#(loc.SuccessHeaderUninstall)", &pLocString);
						m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_SUCCESS_HEADER, pLocString->wzText);
						LocGetString(m_pWixLoc, L"#(loc.SuccessInfoUninstall)", &pLocString);
						m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_SUCCESS_INFO, pLocString->wzText);
					}
					else
					{
						m_fInstallSucceed = TRUE;

						// If we have left some kind of error message file from MSI the show that
						if (BalStringVariableExists(L"MSICustomErrFile"))
						{
							LPWSTR sczUnFormatedErrFile = NULL;
							LPWSTR sczErrFile = NULL;
							LPWSTR sczSuccessErrMsg   = NULL;
							FILE_ENCODING feEncodingFound = FILE_ENCODING_UNSPECIFIED;

							BalGetStringVariable(L"MSICustomErrFile", &sczUnFormatedErrFile);
							BalFormatString(sczUnFormatedErrFile, &sczErrFile);

							if (SUCCEEDED(FileToString(sczErrFile, &sczSuccessErrMsg, &feEncodingFound)))
							{
								LocGetString(m_pWixLoc, L"#(loc.SuccessErrorInfoText)", &pLocString);
								m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_SUCCESS_ERRINF, pLocString->wzText);
								m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_SUCCESS_ERRMSG, sczSuccessErrMsg);
								FileEnsureDelete(sczErrFile);
							}
						}
					}

					if (m_fRestartRequired)
					{
						if (BOOTSTRAPPER_RESTART_PROMPT == m_command.restart)
						{
							fShowRestartButton = TRUE;
						}
					}
					else if (ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_LAUNCH_BUTTON))
					{
						fLaunchTargetExists = BalStringVariableExists(WIXSTDBA_VARIABLE_LAUNCH_TARGET_PATH);
					}

					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_LAUNCH_BUTTON, fLaunchTargetExists && BOOTSTRAPPER_ACTION_UNINSTALL < m_plannedAction);
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_SUCCESS_RESTART_TEXT, fShowRestartButton);
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_SUCCESS_RESTART_BUTTON, fShowRestartButton);
				}
				else if (m_rgdwPageIds[WIXSTDBA_PAGE_FAILURE] == dwNewPageId) // on the "Failure" page, show error message and check if the restart button should be enabled.
				{
					BOOL fShowLogLink = (m_Bundle.sczLogVariable && *m_Bundle.sczLogVariable); // if there is a log file variable then we'll assume the log file exists.
					BOOL fShowErrorMessage = FALSE;
					BOOL fShowRestartButton = FALSE;

					if (m_fIsRepair)
					{
						LocGetString(m_pWixLoc, L"#(loc.FailureHeaderRepair)", &pLocString);
						m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_FAILURE_HEADER, pLocString->wzText);
					}

					if (m_fIsUninstall)
					{
						LocGetString(m_pWixLoc, L"#(loc.FailureHeaderUninstall)", &pLocString);
						m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_FAILURE_HEADER, pLocString->wzText);
					}
					if (FAILED(m_hrFinal))
					{
						// If we know the failure message, use that.
						if (m_sczFailedMessage && *m_sczFailedMessage)
						{
							StrAllocString(&sczUnformattedText, m_sczFailedMessage, 0);
						}
						else // try to get the error message from the error code.
						{
							StrAllocFromError(&sczUnformattedText, m_hrFinal, NULL);
							if (!sczUnformattedText || !*sczUnformattedText)
							{
								StrAllocFromError(&sczUnformattedText, E_FAIL, NULL);
							}
						}

						StrAllocFormatted(&sczText, L"0x%08x - %ls", m_hrFinal, sczUnformattedText);
						ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_FAILURE_MESSAGE_TEXT, sczText);
						fShowErrorMessage = TRUE;
					}

					if (m_fRestartRequired)
					{
						if (BOOTSTRAPPER_RESTART_PROMPT == m_command.restart)
						{
							fShowRestartButton = TRUE;
						}
					}

					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_FAILURE_LOGFILE_LINK, fShowLogLink);
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_FAILURE_MESSAGE_TEXT, fShowErrorMessage);
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_FAILURE_RESTART_TEXT, fShowRestartButton);
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_FAILURE_RESTART_BUTTON, fShowRestartButton);
				}

				// Hide the upgrade link
				if (ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_UPGRADE_LINK))
				{
					ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_UPGRADE_LINK, FALSE);
				}

				// Process each control for special handling in the new page.
				THEME_PAGE* pPage = ThemeGetPage(m_pTheme, dwNewPageId);
				if (pPage)
				{
					for (DWORD i = 0; i < pPage->cControlIndices; ++i)
					{
						THEME_CONTROL* pControl = m_pTheme->rgControls + pPage->rgdwControlIndices[i];

						// If we are on the install, options or modify pages and this is a named control, try to set its default state.
						if ((m_rgdwPageIds[WIXSTDBA_PAGE_INSTALL] == dwNewPageId ||
							m_rgdwPageIds[WIXSTDBA_PAGE_INSTALLDIR] == dwNewPageId ||
							m_rgdwPageIds[WIXSTDBA_PAGE_SVC_OPTIONS] == dwNewPageId ||
							m_rgdwPageIds[WIXSTDBA_PAGE_MODIFY] == dwNewPageId) &&
							pControl->sczName && *pControl->sczName)
						{
							// If this is a checkbox control, try to set its default state to the state of a matching named Burn variable.
							if (THEME_CONTROL_TYPE_CHECKBOX == pControl->type && WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX != pControl->wId)
							{
								LONGLONG llValue = 0;
								HRESULT hr = BalGetNumericVariable(pControl->sczName, &llValue);

								ThemeSendControlMessage(m_pTheme, pControl->wId, BM_SETCHECK, SUCCEEDED(hr) && llValue ? BST_CHECKED : BST_UNCHECKED, 0);
							}

							// If this is a button control with the BS_AUTORADIOBUTTON style, try to set its default
							// state to the state of a matching named Burn variable.
							if (THEME_CONTROL_TYPE_BUTTON == pControl->type && (BS_AUTORADIOBUTTON == (BS_AUTORADIOBUTTON & pControl->dwStyle)))
							{
								LONGLONG llValue = 0;
								HRESULT hr = BalGetNumericVariable(pControl->sczName, &llValue);

								// If the control value isn't set then disable it.
								if (!SUCCEEDED(hr))
								{
									ThemeControlEnable(m_pTheme, pControl->wId, FALSE);
								}
								else
								{
									ThemeSendControlMessage(m_pTheme, pControl->wId, BM_SETCHECK, SUCCEEDED(hr) && llValue ? BST_CHECKED : BST_UNCHECKED, 0);
								}
							}

							// Hide or disable controls based on the control name with 'State' appended
							HRESULT hr = StrAllocFormatted(&sczControlName, L"%lsState", pControl->sczName);
							if (SUCCEEDED(hr))
							{
								hr = BalGetStringVariable(sczControlName, &sczControlState);
								if (SUCCEEDED(hr) && sczControlState && *sczControlState)
								{
									if (CSTR_EQUAL == ::CompareStringW(LOCALE_NEUTRAL, 0, sczControlState, -1, L"disable", -1))
									{
										BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Disable control %ls", pControl->sczName);
										ThemeControlEnable(m_pTheme, pControl->wId, FALSE);
									}
									else if (CSTR_EQUAL == ::CompareStringW(LOCALE_NEUTRAL, 0, sczControlState, -1, L"hide", -1))
									{
										BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Hide control %ls", pControl->sczName);
										// TODO: This doesn't work
										ThemeShowControl(m_pTheme, pControl->wId, SW_HIDE);
									}
								}
							}
						}

						// Format the text in each of the new page's controls (if they have any text).
						if (pControl->sczText && *pControl->sczText)
						{
							HRESULT hr = BalFormatString(pControl->sczText, &sczText);
							if (SUCCEEDED(hr))
							{
								ThemeSetTextControl(m_pTheme, pControl->wId, sczText);
							}
						}

					}
				}

				// See #Hidden
				ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_LABEL, false);
				ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_LOGPASS_LABEL, false);
				ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_EDIT, false);
				ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_LOGPASS_EDIT, false);

				// XXX why do we need this??
				ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_LABEL, true);
				ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_LOGPASS_LABEL, true);
				ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_EDIT, true);
				ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_LOGPASS_EDIT, true);

				ThemeShowPage(m_pTheme, dwOldPageId, SW_HIDE);
				ThemeShowPage(m_pTheme, dwNewPageId, SW_SHOW);


				// Remember current page
				m_dwCurrentPage = dwNewPageId;

				// On the install page set the focus to the install button or the next enabled control if install is disabled
				if (m_rgdwPageIds[WIXSTDBA_PAGE_INSTALL] == dwNewPageId)
				{
					HWND hwndFocus = ::GetDlgItem(m_pTheme->hwndParent, WIXSTDBA_CONTROL_INSTALL_BUTTON);
					if (hwndFocus && !ThemeControlEnabled(m_pTheme, WIXSTDBA_CONTROL_INSTALL_BUTTON))
					{
						hwndFocus = ::GetNextDlgTabItem(m_pTheme->hwndParent, hwndFocus, FALSE);
					}

					if (hwndFocus)
					{
						::SetFocus(hwndFocus);
					}
				}
			}
		}

		ReleaseStr(sczText);
		ReleaseStr(sczUnformattedText);
		ReleaseStr(sczControlState);
		ReleaseStr(sczControlName);
	}


	//
	// OnClose - called when the window is trying to be closed.
	//
	BOOL OnClose()
	{
		BOOL fClose = FALSE;

		// If we've already succeeded or failed or showing the help page, just close (prompts are annoying if the bootstrapper is done).
		// Also, allow people to simply close out at the signin stage
		if (WIXSTDBA_STATE_APPLIED <= m_state || WIXSTDBA_STATE_HELP == m_state || WIXSTDBA_STATE_SVC_OPTIONS == m_state)
		{
			fClose = TRUE;
		}
		else // prompt the user or force the cancel if there is no UI.
		{
			fClose = PromptCancel(m_hWnd, BOOTSTRAPPER_DISPLAY_FULL != m_command.display, m_sczConfirmCloseMessage ? m_sczConfirmCloseMessage : L"Are you sure you want to cancel?", m_pTheme->sczCaption);
		}

		// If we're doing progress then we never close, we just cancel to let rollback occur.
		if (WIXSTDBA_STATE_APPLYING <= m_state && WIXSTDBA_STATE_APPLIED > m_state)
		{
			// If we canceled disable cancel button since clicking it again is silly.
			if (fClose)
			{
				ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_PROGRESS_CANCEL_BUTTON, FALSE);
			}

			fClose = FALSE;
		}

		return fClose;
	}


	//
	// OnClickAcceptCheckbox - allow the install to continue.
	//
	void OnClickAcceptCheckbox()
	{
		BOOL fAcceptedLicense = ThemeIsControlChecked(m_pTheme, WIXSTDBA_CONTROL_EULA_ACCEPT_CHECKBOX);
		ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_INSTALL_BUTTON, fAcceptedLicense);
		ThemeControlEnable(m_pTheme, WIXSTDBA_CONTROL_NEXT_BUTTON, fAcceptedLicense);
	}


	//
	// OnClickOptionsButton - show the options page.
	//
	void OnClickOptionsButton()
	{
		SavePageSettings(WIXSTDBA_PAGE_INSTALL);
		m_stateInstallPage = m_state;
		SetState(WIXSTDBA_STATE_INSTALLDIR, S_OK);
	}


	BOOL CheckNonEmptyField(LPCWSTR wzEditVarID)
	{
		BOOL bRes = TRUE;
		LPWSTR sczFieldValue = NULL;

		if (SUCCEEDED(BalGetStringVariable(wzEditVarID, &sczFieldValue)))
		{
			if (StrCmpCW(sczFieldValue, L"") == 0)
			{
				LOC_STRING* pLocString = NULL;
				LPWSTR wzLoc = NULL;
				LPWSTR sczMessageText = NULL;

				StrAllocFormatted(&wzLoc, L"#(loc.%s)", wzEditVarID);
				LocGetString(m_pWixLoc, wzLoc, &pLocString);
				StrAllocFormatted(&sczMessageText, L"The field \"%s\" cannot be blank! In order to continue with setup you should fill it.", pLocString->wzText);

				::MessageBoxW(m_hWnd, sczMessageText, m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_OK);
				bRes = FALSE;
			}
		}
		return bRes;
	}




	BOOL CheckCurrentUserPassword(LPCWSTR wzPasswordVarID)
	{
		LPWSTR sczUserNameValue = NULL;
		LPWSTR sczDomainValue = NULL;
		LPWSTR sczPasswordValue = NULL;

		BOOL bRes = SUCCEEDED(BalGetStringVariable(L"ComputerName", &sczDomainValue)) &&
					SUCCEEDED(BalGetStringVariable(L"LogonUser", &sczUserNameValue)) &&
					SUCCEEDED(BalGetStringVariable(wzPasswordVarID, &sczPasswordValue));

		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "CheckCurrentUserPassword. 1");


		if (bRes)
		{
			BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "CheckCurrentUserPassword. 2");
			HANDLE hToken;
			if (!LogonUserW(sczUserNameValue, sczDomainValue, sczPasswordValue, LOGON32_LOGON_NETWORK, LOGON32_PROVIDER_DEFAULT, &hToken))
			{
				BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "CheckCurrentUserPassword. 3 - Failed");

				LPWSTR sczMessageText = NULL;
				StrAllocFormatted(&sczMessageText, L"Setup was unable to validate specified password for \"%s\\%s\"! Please double check it.", sczDomainValue, sczUserNameValue);

				::MessageBoxW(m_hWnd, sczMessageText, m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_OK);
				bRes = FALSE;
			}
			else
			{
				BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "CheckCurrentUserPassword. 4 - Succeed");
			}
		}
		return bRes;
	}





	/*

	BOOL CheckPostgreSQLConnection(LPCWSTR VAR_HOST, LPCWSTR VAR_USER, LPCWSTR VAR_PASS, LPCWSTR DB_ToCheck, BOOL DB_ShouldExists)
	{
		BOOL bPSQLOk = CheckNonEmptyField(VAR_HOST) && CheckNonEmptyField(VAR_USER) && CheckNonEmptyField(VAR_PASS);

// 		if (!bPSQLOk) return FALSE;

		LPWSTR sczPSQLPath = NULL;
		LPWSTR sczPSQLDirectory = NULL;

		if (bPSQLOk && SUCCEEDED(PathRelativeToModule(&sczPSQLPath, L"qcPSQL.exe", m_hModule)) && SUCCEEDED(PathGetDirectory(sczPSQLPath, &sczPSQLDirectory)))
		{
			LPWSTR sczPSQLHost = NULL;
			LPWSTR sczPSQLUser = NULL;
			LPWSTR sczPSQLPass = NULL;

			if (SUCCEEDED(BalGetStringVariable(VAR_HOST, &sczPSQLHost)) &&
				SUCCEEDED(BalGetStringVariable(VAR_USER, &sczPSQLUser)) &&
				SUCCEEDED(BalGetStringVariable(VAR_PASS, &sczPSQLPass)) )
			{
				DWORD exitcode = 0;
				LPWSTR sczCmdParam = NULL;
				if (DB_ToCheck == NULL)
					StrAllocFormatted(&sczCmdParam, L"\"%s\" checkconnection -H%s -U%s -P%s", sczPSQLPath, sczPSQLHost, sczPSQLUser, sczPSQLPass);
				else
					StrAllocFormatted(&sczCmdParam, L"\"%s\" checkdbexists -H%s -U%s -P%s -CKDB%s", sczPSQLPath, sczPSQLHost, sczPSQLUser, sczPSQLPass, DB_ToCheck);

				_STARTUPINFOW si;
				_PROCESS_INFORMATION pi;

				ZeroMemory( &si, sizeof(si) );
				si.cb = sizeof(si);
				ZeroMemory( &pi, sizeof(pi) );


				// Start the child process.
				if( CreateProcessW(NULL,   // No module name (use command line)
					sczCmdParam,    // Command line
					NULL,           // Process handle not inheritable
					NULL,           // Thread handle not inheritable
					FALSE,          // Set handle inheritance to FALSE
					CREATE_NO_WINDOW, // No creation flags
					NULL,           // Use parent's environment block
					NULL,           // Use parent's starting directory
					&si,            // Pointer to STARTUPINFO structure
					&pi )           // Pointer to PROCESS_INFORMATION structure
					)
				{
					// Wait until child process exits.
					WaitForSingleObject( pi.hProcess, INFINITE );

					// get the process exit code
					GetExitCodeProcess(pi.hProcess, (LPDWORD)&exitcode);

					// Close process and thread handles.
					CloseHandle( pi.hProcess );
					CloseHandle( pi.hThread );
				}



				LPWSTR sczMessageText = NULL;
				switch (exitcode)
				{
					case QCPSQL_ERROR_UNKNOWN:
						sczMessageText = L"Setup was unable to connect to the specified database server. Unknown error.\nWould you like to continue anyway?";
						break;
					case QCPSQL_ERROR_EXECSQL:
						sczMessageText = L"Setup was unable to execute specified command.\nWould you like to continue anyway?";
						break;
					case QCPSQL_ERROR_CONNECT:
						sczMessageText = L"Setup was unable to connect to the specified database server.\nWould you like to continue anyway?";
						break;
					case QCPSQL_ERROR_INVALIDARGS:
						sczMessageText = L"Setup was unable to connect to the specified database server. Invalid arguments.\nWould you like to continue anyway?";
						break;
					case QCPSQL_SUCCESS_DBNOTEXISTS:
						if ((DB_ToCheck != NULL) && (DB_ShouldExists))
							StrAllocFormatted(&sczMessageText, L"The database \"%s\" does not exists on the host \"%s\".\nWould you like to continue anyway?", DB_ToCheck, sczPSQLHost);
						break;
					case QCPSQL_SUCCESS_DBEXISTS:
						if ((DB_ToCheck != NULL) && (!DB_ShouldExists))
							StrAllocFormatted(&sczMessageText, L"The database \"%s\" already exists on the host \"%s\".\nWould you like to continue anyway?", DB_ToCheck, sczPSQLHost);
						break;
					default:
						break;
				}

				if (sczMessageText != NULL)
					bPSQLOk = (IDYES == ::MessageBoxW(m_hWnd, sczMessageText, m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_YESNO));
			}
		}

		return bPSQLOk;
	}
	*/

	BOOL CheckInstallPathIsValid(LPCWSTR wzInstallPath)
	{
		BOOL bPathIsValid = TRUE;

		if (StrCmpCW(wzInstallPath, L"") == 0)
		{
			bPathIsValid = FALSE;
			::MessageBoxW(m_hWnd, L"The install location cannot be blank. You must enter a full path with drive letter, like:\n\tC:\\Program Files\\App\n\nor a UNC path, like\n\t\\\\ServerName\\AppShare", m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_OK);
		} else {
			DWORD i = 0;
			LPCWSTR wz = wzInstallPath;
			BOOL bInvalidCharFound = FALSE;
			while (*wz)
			{
				++i;
				if ((L'/' == *wz) || ((L':' == *wz) && (i != 2)) || (L'*' == *wz) || (L'?' == *wz) ||
					(L'"' == *wz) || (L'<' == *wz) || (L'>' == *wz) || (L'|' == *wz))
					bInvalidCharFound = TRUE;
				++wz;
			}

			if (bInvalidCharFound)
			{
				bPathIsValid = FALSE;
				::MessageBoxW(m_hWnd, L"The install location cannot include any of the following characters:\n\n/ : * ? \" < > |", m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_OK);
			}
		}
		return bPathIsValid;
	}


	BOOL CheckEmailAddressIsValid(LPCWSTR wzEmailVarID, LPCWSTR wzPassVarID = NULL, BOOL AllowBlank = TRUE)
	{
		BOOL bRes = TRUE;
		LPWSTR sczEmailValue = NULL;
		LPWSTR sczPassValue = NULL;

		if (SUCCEEDED(BalGetStringVariable(wzEmailVarID, &sczEmailValue)))
		{
			LOC_STRING* pLocString = NULL;
			LPWSTR wzLoc = NULL;
			LPWSTR sczMessageText = NULL;

			StrAllocFormatted(&wzLoc, L"#(loc.%s)", wzEmailVarID);
			LocGetString(m_pWixLoc, wzLoc, &pLocString);

			BOOL bIsBlank = (StrCmpCW(sczEmailValue, L"") == 0);

			if (bIsBlank && AllowBlank)
				return TRUE;

			if (bIsBlank)
			{
				bRes = FALSE;
				StrAllocFormatted(&sczMessageText, L"The field \"%s\" cannot be blank! In order to continue with setup you should fill it.", pLocString->wzText);
			} else {
				DWORD i = 0;
				DWORD iAt = 0;
				DWORD iPt = 0;

				LPCWSTR wz = sczEmailValue;
				while (*wz)
				{
					++i;
					if (L'@' == *wz) iAt = i;
					if (L'.' == *wz) iPt = i;
					++wz;
				}
				bRes =  (1 < iAt) && (iAt < iPt);

				if (!bRes)
					StrAllocFormatted(&sczMessageText, L"The field \"%s\" dosen't seems to be a valid email address! Please double check that.", pLocString->wzText);
			}

			if (!bRes)
				::MessageBoxW(m_hWnd, sczMessageText, m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_OK);
			else {
				if (wzPassVarID != NULL)
				{
					if (SUCCEEDED(BalGetStringVariable(wzPassVarID, &sczPassValue)))
						if (StrCmpCW(sczEmailValue, L"") == 0) {
							bRes = FALSE;
							::MessageBoxW(m_hWnd, L"You specified a valid email address but the account password is blank. The password is required!", m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_OK);
						}
				}
			}

		}

		return bRes;
	}


	void OnClickNextButton()
	{
		BOOL bOkToContinue = TRUE;
		LPWSTR sczPath = NULL;

		switch (m_state)
		{
		// this clause is dead code, since we cancelled the "choose an
		// install directory" screen. but let's leave it in, in case we
		// bring it back.
		case WIXSTDBA_STATE_INSTALLDIR:
			ThemeGetTextControl(m_pTheme, WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX, &sczPath);
			bOkToContinue = CheckInstallPathIsValid(sczPath);

			if (bOkToContinue) {
				m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_INSTALL_FOLDER, sczPath);
				SavePageSettings(WIXSTDBA_PAGE_INSTALLDIR);
				SetState(WIXSTDBA_STATE_SVC_OPTIONS, S_OK);

				// Display the elevation shield if perMachine installation
				LONGLONG llElevated = 0;
				if (SUCCEEDED(BalGetNumericVariable(WIXSTDBA_VARIABLE_PERMACHINE_INSTALL, &llElevated)))
					ThemeControlElevates(m_pTheme, WIXSTDBA_CONTROL_INSTALL_BUTTON, (llElevated == 1));
			}
			break;

		default:
			SavePageSettings(WIXSTDBA_PAGE_INSTALL);
			m_stateInstallPage = m_state;
			SetState(WIXSTDBA_STATE_SVC_OPTIONS, S_OK);
			break;
		}
	}


	//
	// OnClickInstallScope - allow user to choose between a perMachine and perUser install
	//
	void OnClickInstallScope()
	{
		LPWSTR sczPath = NULL;
		LPWSTR sczFPath = NULL;
		BOOL fPerMachineInst = ThemeIsControlChecked(m_pTheme, WIXSTDBA_CONTROL_PERMACHINE_RADIO);


		if (fPerMachineInst)
		{
			if (SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_PERMACHINE_INSTALL_FOLDER, &sczPath))
				&& SUCCEEDED(BalFormatString(sczPath, &sczFPath)))
					ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX, sczFPath);
		}
		else
		{
			if (SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_PERUSER_INSTALL_FOLDER, &sczPath))
				&& SUCCEEDED(BalFormatString(sczPath, &sczFPath)))
					ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX, sczFPath);
		}
	}

	//
	// OnClickInstallPostgressCheckbox - we will set defaults value and disable controls if checkbox was checked.
	//
	void OnClickSkipRegistrationCheckbox()
	{
		BOOL fSignIn = ThemeIsControlChecked(m_pTheme, WIXSTDBA_CONTROL_REGSIGNIN_RADIO);

		//if (fSkipReg)
		//{
		//	ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_DBHOST_EDIT, L"localhost");
		//	ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_DBUSER_EDIT, L"postgres");
		//	ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_DBPASS_EDIT, L"postgres");
		//}

		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_REGMAIL_LABEL, !fSignIn);
		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_REGUSER_LABEL, !fSignIn);
		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_REGPASS_LABEL, !fSignIn);
		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_REGMAIL_EDIT, !fSignIn);
		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_REGUSER_EDIT, !fSignIn);
		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_REGPASS_EDIT, !fSignIn);

		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_LABEL, fSignIn);
		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_LOGPASS_LABEL, fSignIn);
		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_LOGUSER_OR_MAIL_EDIT, fSignIn);
		ThemeShowControl(m_pTheme, WIXSTDBA_CONTROL_LOGPASS_EDIT, fSignIn);
	}



	void OnSignIn()
	{
		BOOL fSignIn = ThemeIsControlChecked(m_pTheme, WIXSTDBA_CONTROL_REGSIGNIN_RADIO);
		BOOL bOkToContinue = false;

		SavePageSettings(WIXSTDBA_PAGE_SVC_OPTIONS);

		if (fSignIn)
		{
			LPWSTR wzUserNameOrEmail = NULL;
			LPWSTR wzUserPass = NULL;
			if (SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_LOG_USERNAME_OR_MAIL, &wzUserNameOrEmail)) &&
				SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_LOG_PASS, &wzUserPass)))
			{
				bOkToContinue = REST_SignInOrRegister(true, wzUserNameOrEmail, NULL, NULL, wzUserPass);
			}
		}
		else
		{
			LPWSTR wzUserName = NULL;
			LPWSTR wzEmail = NULL;
			LPWSTR wzUserPass = NULL;
			if (SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_REG_MAIL, &wzEmail)) &&
				SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_REG_USER, &wzUserName)) &&
				SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_REG_PASS, &wzUserPass)))
			{
				bOkToContinue = REST_SignInOrRegister(false, NULL, wzUserName, wzEmail, wzUserPass);
			}
		}

		if (bOkToContinue)
			this->SetState(WIXSTDBA_STATE_APPLIED, S_OK);
	}


	void OnClickBackButton()
	{
		BOOL bOkToContinue = TRUE;
		LPWSTR sczPath = NULL;

		switch (m_state)
		{
		case WIXSTDBA_STATE_INSTALLDIR:
			ThemeGetTextControl(m_pTheme, WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX, &sczPath);
			bOkToContinue = CheckInstallPathIsValid(sczPath);

			if (bOkToContinue) {
				m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_INSTALL_FOLDER, sczPath);
				SavePageSettings(WIXSTDBA_PAGE_INSTALLDIR);
				SetState(m_stateInstallPage, S_OK);
			}

			break;

		case WIXSTDBA_STATE_SVC_OPTIONS:
			SavePageSettings(WIXSTDBA_PAGE_SVC_OPTIONS);
			SetState(WIXSTDBA_STATE_DETECTED, S_OK);
			break;
		}

	}


	//
	// OnClickOptionsBrowseButton - browse for install folder on the options page.
	//
	void OnClickOptionsBrowseButton(DWORD dwControl)
	{
		WCHAR wzPath[MAX_PATH] = { };
		BROWSEINFOW browseInfo = { };
		PIDLIST_ABSOLUTE pidl = NULL;
		PIDLIST_ABSOLUTE pidlRoot = NULL;

		::SHGetFolderLocation(m_hWnd, CSIDL_DRIVES, NULL, 0, &pidlRoot);

		browseInfo.hwndOwner = m_hWnd;
		browseInfo.pszDisplayName = wzPath;
		browseInfo.lpszTitle = m_pTheme->sczCaption;
		browseInfo.ulFlags = BIF_RETURNONLYFSDIRS | BIF_USENEWUI;
		browseInfo.pidlRoot = pidlRoot;
		pidl = ::SHBrowseForFolderW(&browseInfo);
		if (pidl && ::SHGetPathFromIDListW(pidl, wzPath))
		{
			switch (dwControl)
			{
			case WIXSTDBA_CONTROL_BROWSE_BUTTON:
				ThemeSetTextControl(m_pTheme, WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX, wzPath);
				break;
			}
		}

		if (pidl)
		{
			::CoTaskMemFree(pidl);
		}

		return;
	}

	//
	// OnClickOptionsOkButton - accept the changes made by the options page.
	//
	void OnClickOptionsOkButton()
	{
		HRESULT hr = S_OK;
		LPWSTR sczPath = NULL;

		if (ThemeControlExists(m_pTheme, WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX))
		{
			hr = ThemeGetTextControl(m_pTheme, WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX, &sczPath);
			ExitOnFailure(hr, "Failed to get text from folder edit box.");

			// TODO: verify the path is valid.

			hr = m_pEngine->SetVariableString(WIXSTDBA_VARIABLE_INSTALL_FOLDER, sczPath);
			ExitOnFailure(hr, "Failed to set the install folder.");
		}


		SavePageSettings(WIXSTDBA_PAGE_INSTALLDIR);

LExit:
		SetState(m_stateInstallPage, S_OK);
		return;
	}


	//
	// OnClickOptionsCancelButton - discard the changes made by the options page.
	//
	void OnClickOptionsCancelButton()
	{
		SetState(m_stateInstallPage, S_OK);
	}


	//
	// OnClickRepairButton - start the repair.
	//
	void OnClickRepairButton()
	{
		this->OnPlan(BOOTSTRAPPER_ACTION_REPAIR);
	}


	//
	// OnClickUninstallButton - start the uninstall.
	//
	void OnClickUninstallButton()
	{
		this->OnPlan(BOOTSTRAPPER_ACTION_UNINSTALL);
	}



	void TryLaunchAfterInstall(LPWSTR wzVarTargetPath)
	{
		BOOL fLaunchAfterInstallTargetExists = BalStringVariableExists(wzVarTargetPath);

		HRESULT hr = S_OK;
		LPWSTR sczUnformattedLaunchTarget = NULL;
		LPWSTR sczLaunchTarget = NULL;
		LPWSTR sczUnformattedArguments = NULL;
		LPWSTR sczArguments = NULL;
		LPWSTR sczRunOnceValue = NULL;

		int nCmdShow = SW_SHOWNORMAL;

		if (fLaunchAfterInstallTargetExists)
		{
			hr = BalGetStringVariable(wzVarTargetPath, &sczUnformattedLaunchTarget);
			hr = BalFormatString(sczUnformattedLaunchTarget, &sczLaunchTarget);
		}

		if (m_fInstallSucceed && fLaunchAfterInstallTargetExists)
		{

			if (!m_fRestartRequired)
			{
				DWORD dwAttr;
				if (FileExistsEx(sczLaunchTarget, &dwAttr))
					ShelExec(sczLaunchTarget, sczArguments, L"open", NULL, nCmdShow, m_hWnd, NULL);
			}
		}

		ReleaseStr(sczUnformattedLaunchTarget);
		ReleaseStr(sczLaunchTarget);
		ReleaseStr(sczUnformattedArguments);
		ReleaseStr(sczArguments);
		ReleaseStr(sczRunOnceValue);

		return;
	}

	//
	// OnClickCloseButton - close the application.
	//
	void OnClickCloseButton()
	{
		TryLaunchAfterInstall(L"Launch_IISStartServerPath");
		TryLaunchAfterInstall(L"Launch_EverywarePOSPath");
		::SendMessageW(m_hWnd, WM_CLOSE, 0, 0);
		return;
	}


	//
	// OnClickEulaLink - show the end user license agreement.
	//
	void OnClickEulaLink()
	{
		HRESULT hr = S_OK;
		LPWSTR sczLicenseUrl = NULL;
		LPWSTR sczLicensePath = NULL;
		LPWSTR sczLicenseDirectory = NULL;
		URI_PROTOCOL protocol = URI_PROTOCOL_UNKNOWN;

		hr = StrAllocString(&sczLicenseUrl, m_sczLicenseUrl, 0);
		BalExitOnFailure1(hr, "Failed to copy license URL: %ls", m_sczLicenseUrl);

		hr = LocLocalizeString(m_pWixLoc, &sczLicenseUrl);
		BalExitOnFailure1(hr, "Failed to localize license URL: %ls", m_sczLicenseUrl);

		hr = BalFormatString(sczLicenseUrl, &sczLicenseUrl);
		BalExitOnFailure1(hr, "Failed to get formatted license URL: %ls", m_sczLicenseUrl);

		hr = UriProtocol(sczLicenseUrl, &protocol);
		if (FAILED(hr) || URI_PROTOCOL_UNKNOWN == protocol)
		{
			// Probe for localised license file
			hr = PathRelativeToModule(&sczLicensePath, sczLicenseUrl, m_hModule);
			if (SUCCEEDED(hr))
			{
				hr = PathGetDirectory(sczLicensePath, &sczLicenseDirectory);
				if (SUCCEEDED(hr))
				{
					hr = LocProbeForFile(sczLicenseDirectory, PathFile(sczLicenseUrl), m_sczLanguage, &sczLicensePath);
				}
			}
		}

		hr = ShelExec(sczLicensePath ? sczLicensePath : sczLicenseUrl, NULL, L"open", NULL, SW_SHOWDEFAULT, m_hWnd, NULL);
		BalExitOnFailure(hr, "Failed to launch URL to EULA.");

LExit:
		ReleaseStr(sczLicensePath);
		ReleaseStr(sczLicenseUrl);
		ReleaseStr(sczLicenseDirectory);

		return;
	}


	//
	// OnClickUpgradeLink - download the upgrade.
	//
	void OnClickUpgradeLink()
	{
		this->OnPlan(BOOTSTRAPPER_ACTION_UPDATE_REPLACE);

		m_fUpdating = TRUE;

		return;
	}


	//
	// OnClickLaunchButton - launch the app from the success page.
	//
	void OnClickLaunchButton()
	{
		HRESULT hr = S_OK;
		LPWSTR sczUnformattedLaunchTarget = NULL;
		LPWSTR sczLaunchTarget = NULL;
		LPWSTR sczUnformattedArguments = NULL;
		LPWSTR sczArguments = NULL;
		int nCmdShow = SW_SHOWNORMAL;

		hr = BalGetStringVariable(WIXSTDBA_VARIABLE_LAUNCH_TARGET_PATH, &sczUnformattedLaunchTarget);
		BalExitOnFailure1(hr, "Failed to get launch target variable '%ls'.", WIXSTDBA_VARIABLE_LAUNCH_TARGET_PATH);

		hr = BalFormatString(sczUnformattedLaunchTarget, &sczLaunchTarget);
		BalExitOnFailure1(hr, "Failed to format launch target variable: %ls", sczUnformattedLaunchTarget);

		if (BalStringVariableExists(WIXSTDBA_VARIABLE_LAUNCH_ARGUMENTS))
		{
			hr = BalGetStringVariable(WIXSTDBA_VARIABLE_LAUNCH_ARGUMENTS, &sczUnformattedArguments);
			BalExitOnFailure1(hr, "Failed to get launch arguments '%ls'.", WIXSTDBA_VARIABLE_LAUNCH_ARGUMENTS);

			hr = BalFormatString(sczUnformattedArguments, &sczArguments);
			BalExitOnFailure1(hr, "Failed to format launch arguments variable: %ls", sczUnformattedArguments);
		}

		if (BalStringVariableExists(WIXSTDBA_VARIABLE_LAUNCH_HIDDEN))
		{
			nCmdShow = SW_HIDE;
		}

		hr = ShelExec(sczLaunchTarget, sczArguments, L"open", NULL, nCmdShow, m_hWnd, NULL);
		BalExitOnFailure1(hr, "Failed to launch target: %ls", sczLaunchTarget);

		::PostMessageW(m_hWnd, WM_CLOSE, 0, 0);

LExit:
		ReleaseStr(sczLaunchTarget);
		ReleaseStr(sczUnformattedLaunchTarget);
		ReleaseStr(sczArguments);
		ReleaseStr(sczUnformattedArguments);

		return;
	}


	//
	// OnClickRestartButton - allows the restart and closes the app.
	//
	void OnClickRestartButton()
	{
		AssertSz(m_fRestartRequired, "Restart must be requested to be able to click on the restart button.");

		m_fAllowRestart = TRUE;
		::SendMessageW(m_hWnd, WM_CLOSE, 0, 0);

		return;
	}


	//
	// OnClickLogFileLink - show the log file.
	//
	void OnClickLogFileLink()
	{
		HRESULT hr = S_OK;
		LPWSTR sczLogFile = NULL;

		hr = BalGetStringVariable(m_Bundle.sczLogVariable, &sczLogFile);
		BalExitOnFailure1(hr, "Failed to get log file variable '%ls'.", m_Bundle.sczLogVariable);

		hr = ShelExec(L"notepad.exe", sczLogFile, L"open", NULL, SW_SHOWDEFAULT, m_hWnd, NULL);
		BalExitOnFailure1(hr, "Failed to open log file target: %ls", sczLogFile);

LExit:
		ReleaseStr(sczLogFile);

		return;
	}


	//
	// SetState
	//
	void SetState(
		__in WIXSTDBA_STATE state,
		__in HRESULT hrStatus
		)
	{
		if (FAILED(hrStatus))
		{
			m_hrFinal = hrStatus;
		}

		if (FAILED(m_hrFinal))
		{
			state = WIXSTDBA_STATE_FAILED;
		}

		if (WIXSTDBA_STATE_INSTALLDIR == state || m_state < state)
		{
			::PostMessageW(m_hWnd, WM_WIXSTDBA_CHANGE_STATE, 0, state);
		}

		if (WIXSTDBA_STATE_INSTALLDIR == state || m_state < state)
		{
			::PostMessageW(m_hWnd, WM_WIXSTDBA_CHANGE_STATE, 0, state);
		}

		if (WIXSTDBA_STATE_SVC_OPTIONS == state || m_state < state)
		{
			::PostMessageW(m_hWnd, WM_WIXSTDBA_CHANGE_STATE, 0, state);
		}
	}


	void DeterminePageId(
		__in WIXSTDBA_STATE state,
		__out DWORD* pdwPageId
		)
	{
		if (BOOTSTRAPPER_DISPLAY_PASSIVE == m_command.display)
		{
			switch (state)
			{
			case WIXSTDBA_STATE_INITIALIZED:
				*pdwPageId = BOOTSTRAPPER_ACTION_HELP == m_command.action ? m_rgdwPageIds[WIXSTDBA_PAGE_HELP] : m_rgdwPageIds[WIXSTDBA_PAGE_LOADING];
				break;

			case WIXSTDBA_STATE_HELP:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_HELP];
				break;

			case WIXSTDBA_STATE_DETECTING:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_LOADING] ? m_rgdwPageIds[WIXSTDBA_PAGE_LOADING] : m_rgdwPageIds[WIXSTDBA_PAGE_PROGRESS_PASSIVE] ? m_rgdwPageIds[WIXSTDBA_PAGE_PROGRESS_PASSIVE] : m_rgdwPageIds[WIXSTDBA_PAGE_PROGRESS];
				break;

			case WIXSTDBA_STATE_DETECTED: __fallthrough;
			case WIXSTDBA_STATE_PLANNING: __fallthrough;
			case WIXSTDBA_STATE_PLANNED: __fallthrough;
			case WIXSTDBA_STATE_APPLYING: __fallthrough;
			case WIXSTDBA_STATE_CACHING: __fallthrough;
			case WIXSTDBA_STATE_CACHED: __fallthrough;
			case WIXSTDBA_STATE_EXECUTING: __fallthrough;
			case WIXSTDBA_STATE_EXECUTED:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_PROGRESS_PASSIVE] ? m_rgdwPageIds[WIXSTDBA_PAGE_PROGRESS_PASSIVE] : m_rgdwPageIds[WIXSTDBA_PAGE_PROGRESS];
				break;

			default:
				*pdwPageId = 0;
				break;
			}
		}
		else if (BOOTSTRAPPER_DISPLAY_FULL == m_command.display)
		{
			switch (state)
			{
			case WIXSTDBA_STATE_INITIALIZING:
				*pdwPageId = 0;
				break;

			case WIXSTDBA_STATE_INITIALIZED:
				*pdwPageId = BOOTSTRAPPER_ACTION_HELP == m_command.action ? m_rgdwPageIds[WIXSTDBA_PAGE_HELP] : m_rgdwPageIds[WIXSTDBA_PAGE_LOADING];
				break;

			case WIXSTDBA_STATE_HELP:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_HELP];
				break;

			case WIXSTDBA_STATE_DETECTING:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_LOADING];
				break;

			case WIXSTDBA_STATE_DETECTED:
				switch (m_command.action)
				{
				case BOOTSTRAPPER_ACTION_INSTALL:
					*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_INSTALL];
					break;

				case BOOTSTRAPPER_ACTION_MODIFY: __fallthrough;
				case BOOTSTRAPPER_ACTION_REPAIR: __fallthrough;
				case BOOTSTRAPPER_ACTION_UNINSTALL:
					*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_MODIFY];
					break;
				}
				break;

			case WIXSTDBA_STATE_INSTALLDIR:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_INSTALLDIR];
				break;

			case WIXSTDBA_STATE_SVC_OPTIONS:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_SVC_OPTIONS];
				break;

			case WIXSTDBA_STATE_PLANNING: __fallthrough;
			case WIXSTDBA_STATE_PLANNED: __fallthrough;
			case WIXSTDBA_STATE_APPLYING: __fallthrough;
			case WIXSTDBA_STATE_CACHING: __fallthrough;
			case WIXSTDBA_STATE_CACHED: __fallthrough;
			case WIXSTDBA_STATE_EXECUTING: __fallthrough;
			case WIXSTDBA_STATE_EXECUTED:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_PROGRESS];
				break;

			case WIXSTDBA_STATE_APPLIED:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_SUCCESS];
				CopyBundleLogToSpecifiedPath();
				break;

			case WIXSTDBA_STATE_FAILED:
				*pdwPageId = m_rgdwPageIds[WIXSTDBA_PAGE_FAILURE];
				CopyBundleLogToSpecifiedPath();
				break;
			}
		}
	}


	HRESULT EvaluateConditions()
	{
		HRESULT hr = S_OK;
		BOOL fResult = FALSE;

		for (DWORD i = 0; i < m_Conditions.cConditions; ++i)
		{
			BAL_CONDITION* pCondition = m_Conditions.rgConditions + i;

			hr = BalConditionEvaluate(pCondition, m_pEngine, &fResult, &m_sczFailedMessage);
			BalExitOnFailure(hr, "Failed to evaluate condition.");

			if (!fResult)
			{
				hr = E_WIXSTDBA_CONDITION_FAILED;
				BalExitOnFailure1(hr, "Bundle condition evaluated to false: %ls", pCondition->sczCondition);
			}
		}

		ReleaseNullStr(m_sczFailedMessage);

LExit:
		return hr;
	}



	void CopyBundleLogToSpecifiedPath()
	{
		/// On package install complete, if WIXSTDBA_VARIABLE_LOGSPATH is defined
		/// then will move bundle installation log to the specified path.
		if (!m_fOverallInstallationStarted)
			return;

		if (BalStringVariableExists(WIXSTDBA_VARIABLE_LOGSPATH))
		{
			LPWSTR wzBundleLog = NULL;
			LPWSTR wzInstallLogPath = NULL;
			LPWSTR wzDstBundleLog = NULL;

			if ( SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_LOGSPATH, &wzInstallLogPath)) &&
				SUCCEEDED(BalGetStringVariable(L"WixBundleLog", &wzBundleLog)))
			{
				StrAllocFormatted(&wzDstBundleLog, L"%s\\%s", wzInstallLogPath, PathFile(wzBundleLog));
				DirEnsureExists(wzInstallLogPath, NULL);
				FileEnsureCopy(wzBundleLog, wzDstBundleLog, TRUE);
			} else
				BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "Setup was unable to copy bundle log to the specified installation log path.");
		}

		return;
	}



	void SetTaskbarButtonProgress(
		__in DWORD dwOverallPercentage
		)
	{
		HRESULT hr = S_OK;
		if (m_fAttachedToConsole)
		{
			CONSOLE_SCREEN_BUFFER_INFO csbiInfo;
			if (GetConsoleScreenBufferInfo(m_fStdConsoleHandle, &csbiInfo))
			{
				csbiInfo.dwCursorPosition.X = 0;
				SetConsoleCursorPosition(m_fStdConsoleHandle, csbiInfo.dwCursorPosition);
			}

			int lnWidth = 79;
			int barWidth = 60;
			int pos = int(barWidth * dwOverallPercentage/100);
			char  szPgLine[200] = "[";

			for (int i = 0; i < barWidth; ++i)
			{
				if (i < pos)
				{
					sprintf_s(szPgLine, lnWidth, "%s%s", szPgLine, "=");
				}
				else if (i == pos)
				{
					sprintf_s(szPgLine, lnWidth, "%s%s", szPgLine, ">");
				}
				else
				{
					sprintf_s(szPgLine, lnWidth, "%s%s", szPgLine, " ");
				}
			}
			sprintf_s(szPgLine, lnWidth, "%s] %u%%", szPgLine, dwOverallPercentage);

			DWORD dSzWritten;
			WriteConsole(m_fStdConsoleHandle, szPgLine, strlen(szPgLine), &dSzWritten, NULL);
			//			m_fStdConsoleHandle = NULL;
		}


		if (m_fTaskbarButtonOK)
		{
//			hr = m_pTaskbarList->SetProgressValue(m_hWnd, dwOverallPercentage, 100UL);
			BalExitOnFailure1(hr, "Failed to set taskbar button progress to: %d%%.", dwOverallPercentage);
		}

LExit:
		return;
	}


	void SetTaskbarButtonState(
		__in TBPFLAG tbpFlags
		)
	{
		HRESULT hr = S_OK;

		if (m_fTaskbarButtonOK)
		{
			hr = m_pTaskbarList->SetProgressState(m_hWnd, tbpFlags);
			BalExitOnFailure1(hr, "Failed to set taskbar button state.", tbpFlags);
		}

LExit:
		return;
	}


	void SetProgressState(
		__in HRESULT hrStatus
		)
	{
		TBPFLAG flag = TBPF_NORMAL;

		if (IsCanceled() || HRESULT_FROM_WIN32(ERROR_INSTALL_USEREXIT) == hrStatus)
		{
			flag = TBPF_PAUSED;
		}
		else if (IsRollingBack() || FAILED(hrStatus))
		{
			flag = TBPF_ERROR;
		}

		SetTaskbarButtonState(flag);
	}


	void SavePageSettings(
		__in WIXSTDBA_PAGE page
		)
	{
		THEME_PAGE* pPage = NULL;

		pPage = ThemeGetPage(m_pTheme, m_rgdwPageIds[page]);
		if (pPage)
		{
			for (DWORD i = 0; i < pPage->cControlIndices; ++i)
			{
				// Loop through all the checkbox controls (or buttons with BS_AUTORADIOBUTTON) with names and set a Burn variable with that name to true or false.
				THEME_CONTROL* pControl = m_pTheme->rgControls + pPage->rgdwControlIndices[i];
				if ((THEME_CONTROL_TYPE_CHECKBOX == pControl->type) ||
					(THEME_CONTROL_TYPE_BUTTON == pControl->type && (BS_AUTORADIOBUTTON == (BS_AUTORADIOBUTTON & pControl->dwStyle)) &&
					pControl->sczName && *pControl->sczName))
				{
					BOOL bChecked = ThemeIsControlChecked(m_pTheme, pControl->wId);
					m_pEngine->SetVariableNumeric(pControl->sczName, bChecked ? 1 : 0);
				}

				// Loop through all the editbox controls with names and set a Burn variable with that name to the contents.
				if (THEME_CONTROL_TYPE_EDITBOX == pControl->type && pControl->sczName && *pControl->sczName &&
					(WIXSTDBA_CONTROL_INSTALLFOLDER_EDITBOX != pControl->wId))
				{
					LPWSTR sczValue = NULL;
					ThemeGetTextControl(m_pTheme, pControl->wId, &sczValue);
					m_pEngine->SetVariableString(pControl->sczName, sczValue);
				}
			}
		}
	}



	HRESULT LoadBootstrapperBAFunctions()
	{
		HRESULT hr = S_OK;
		LPWSTR sczBafPath = NULL;

		hr = PathRelativeToModule(&sczBafPath, L"bafunctions.dll", m_hModule);
		BalExitOnFailure(hr, "Failed to get path to BA function DLL.");

#ifdef DEBUG
		BalLog(BOOTSTRAPPER_LOG_LEVEL_STANDARD, "WIXEXTBA: LoadBootstrapperBAFunctions() - BA function DLL '%ls'", sczBafPath);
#endif

		m_hBAFModule = ::LoadLibraryW(sczBafPath);
		if (m_hBAFModule)
		{
			PFN_BOOTSTRAPPER_BA_FUNCTION_CREATE pfnBAFunctionCreate = reinterpret_cast<PFN_BOOTSTRAPPER_BA_FUNCTION_CREATE>(::GetProcAddress(m_hBAFModule, "CreateBootstrapperBAFunction"));
			BalExitOnNullWithLastError1(pfnBAFunctionCreate, hr, "Failed to get CreateBootstrapperBAFunction entry-point from: %ls", sczBafPath);

			hr = pfnBAFunctionCreate(m_pEngine, m_hBAFModule, &m_pBAFunction);
			BalExitOnFailure(hr, "Failed to create BA function.");
		}
#ifdef DEBUG
		else
		{
			BalLogError(HRESULT_FROM_WIN32(::GetLastError()), "WIXEXTBA: LoadBootstrapperBAFunctions() - Failed to load DLL %ls", sczBafPath);
		}
#endif

LExit:
		if (m_hBAFModule && !m_pBAFunction)
		{
			::FreeLibrary(m_hBAFModule);
			m_hBAFModule = NULL;
		}
		ReleaseStr(sczBafPath);

		return hr;
	}

typedef void (WINAPI *PGNSI)(LPSYSTEM_INFO);

bool getWindowsUserAgent(std::string &str){
 OSVERSIONINFOEX osvi;
 SYSTEM_INFO si;
 BOOL bOsVersionInfoEx;
 ZeroMemory(&si, sizeof(SYSTEM_INFO));
 ZeroMemory(&osvi, sizeof(OSVERSIONINFOEX)); osvi.dwOSVersionInfoSize = sizeof(OSVERSIONINFOEX);
 bOsVersionInfoEx = GetVersionEx((OSVERSIONINFO*) &osvi); if(bOsVersionInfoEx == 0)
  return false;
 PGNSI pGNSI = (PGNSI) GetProcAddress(GetModuleHandle(TEXT("kernel32.dll")), "GetNativeSystemInfo");
 if(NULL != pGNSI)
  pGNSI(&si);
 else GetSystemInfo(&si);
 std::stringstream os;
 os << "Installer/wix os/win32 (Windows_NT; ";
 os << osvi.dwMajorVersion << "." << osvi.dwMinorVersion << "." << osvi.dwBuildNumber;
 os << "; ia32;)";
 str = os.str();
 return true; 
}


	#pragma comment( lib,"Wininet.lib")


#define BUF_LEN 1024

BOOL POSTRequest(
	__in LPCSTR szHost,
	__in LPCSTR szApiPath,
	__in LPSTR  szFormData,
	__out LPSTR *ppszResponseMessage)
{
	BOOL bRes = false;
	StrAnsiAlloc(ppszResponseMessage, BUF_LEN);

	std::string header = "Content-Type: application/x-www-form-urlencoded";

	std::string userAgent;
	if (getWindowsUserAgent(userAgent)) {
		header += std::string("\nUser-Agent: ");
		header += userAgent;
	}

	LPCSTR method = "POST";
	LPCSTR agent  = "Mozilla/4.0 (compatible; MSIE 1.0)";

	HINTERNET internet = InternetOpenA(agent, INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
	if(internet != NULL)
	{
		HINTERNET connect = InternetConnectA(internet, szHost, INTERNET_DEFAULT_HTTPS_PORT, NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
		if(connect != NULL)
		{
			HINTERNET request = HttpOpenRequestA(connect, method, szApiPath, "HTTP/1.1", NULL, NULL,
				INTERNET_FLAG_HYPERLINK |
				INTERNET_FLAG_IGNORE_REDIRECT_TO_HTTP  |
				INTERNET_FLAG_IGNORE_REDIRECT_TO_HTTPS |
				INTERNET_FLAG_NO_AUTH |
				INTERNET_FLAG_NO_CACHE_WRITE |
				INTERNET_FLAG_NO_UI |
				INTERNET_FLAG_PRAGMA_NOCACHE |
				INTERNET_FLAG_RELOAD |
				INTERNET_FLAG_SECURE, NULL);

			if(request != NULL)
			{
				int datalen = 0;
				if(szFormData != NULL) datalen = strlen(szFormData);
				int headerlen = 0;
				headerlen = (int)header.length();

				if(HttpSendRequestA(request, header.c_str(), headerlen, szFormData, datalen))
				{
					// We have succesfully sent the POST request
					bRes = true;

					// Now we should read the response
					DWORD bytesRead;
					char holdBuff[4096];
					char* temp = holdBuff;
					while (InternetReadFile(request, temp, 1024, &bytesRead) == TRUE && bytesRead > 0)
					{
						temp += bytesRead;
					}
					*temp = '\0';    // manually append NULL terminator

					StringCchPrintfA(*ppszResponseMessage, BUF_LEN, holdBuff);
				}
				else
					StringCchPrintfA(*ppszResponseMessage, BUF_LEN, "Failed to send http request. Error code: %d", ::GetLastError());

				InternetCloseHandle(request);
			}
			else
				StringCchPrintfA(*ppszResponseMessage, BUF_LEN, "Failed to open http request.");
		}
		else
			StringCchPrintfA(*ppszResponseMessage, BUF_LEN, "Connectiong to %s failed.", szHost);

		InternetCloseHandle(connect);
	}
	else
		StringCchPrintfA(*ppszResponseMessage, BUF_LEN, "Initialize internet resources failed.");
	InternetCloseHandle(internet);

	return bRes;
}


BOOL REST_SignInOrRegister(
	__in BOOL    fSignIn,
    __in LPCWSTR wzSignInUserNameOrEmail,
    __in LPCWSTR wzRegisterUsername,
    __in LPCWSTR wzRegisterEmail,
    __in LPCWSTR wzPassword/*,
    __out LPWSTR *ppwzErrorMessage*/
    )
{
	BOOL bRes = false;
	wchar_t wzFormData[BUF_LEN] = L"";

	DWORD escapedLength;

	escapedLength = BUF_LEN;
	wchar_t wzPasswordEscaped[BUF_LEN];
	UrlEscapeW(wzPassword, wzPasswordEscaped, &escapedLength, NULL);

	if (fSignIn) {
		// sign in
		wchar_t *wzUsernameOrEmailKey;
		if (wcschr(wzSignInUserNameOrEmail, L'@')) {
			wzUsernameOrEmailKey = L"meteorAccountsLoginInfo[email]";
		} else {
			wzUsernameOrEmailKey = L"meteorAccountsLoginInfo[username]";		
		}

		escapedLength = BUF_LEN;
		wchar_t wzSignInUserNameOrEmailEscaped[BUF_LEN];
		UrlEscapeW(wzSignInUserNameOrEmail, wzSignInUserNameOrEmailEscaped, &escapedLength, NULL);

		StringCchPrintfW(wzFormData, BUF_LEN, L"%s=%s&meteorAccountsLoginInfo[password]=%s", wzUsernameOrEmailKey, wzSignInUserNameOrEmailEscaped, wzPasswordEscaped);
	} else {
		escapedLength = BUF_LEN;
		wchar_t wzRegisterUsernameEscaped[BUF_LEN];
		UrlEscapeW(wzRegisterUsername, wzRegisterUsernameEscaped, &escapedLength, NULL);

		escapedLength = BUF_LEN;
		wchar_t wzRegisterEmailEscaped[BUF_LEN];
		UrlEscapeW(wzRegisterEmail, wzRegisterEmailEscaped, &escapedLength, NULL);

		// register
		StringCchPrintfW(wzFormData, BUF_LEN, L"username=%s&email=%s&password=%s", wzRegisterUsernameEscaped, wzRegisterEmailEscaped, wzPasswordEscaped);
	}

  // agentInfo part of the query
  wchar_t aiHostW[BUF_LEN] = L"";
  DWORD aiHostSize = BUF_LEN;
  GetComputerNameW(aiHostW, &aiHostSize);

  LPWSTR aiAgentVersion = NULL;
  BalGetStringVariable(WIXSTDBA_VARIABLE_VERSION, &aiAgentVersion);

  wchar_t wzAgentInfo[BUF_LEN] = L"";
  StringCchPrintfW(wzAgentInfo, BUF_LEN, L"agentInfo[host]=%s&agentInfo[agent]=%s&agentInfo[agentVersion]=%s&agentInfo[arch]=%s",
      aiHostW, L"Windows Installer", aiAgentVersion, L"os.windows.x64_32");
  StringCchCatW(wzFormData, BUF_LEN, L"&");
  StringCchCatW(wzFormData, BUF_LEN, wzAgentInfo);

  size_t i;
  char *pMBFormData = (char *)malloc( BUF_LEN );
  wcstombs_s(&i, pMBFormData, (size_t)BUF_LEN, wzFormData, (size_t)BUF_LEN );

  char *pMBDataResponse = NULL;
	wchar_t wzErrorMessage[BUF_LEN] = L"";

	char *path = fSignIn ? "/api/v1/private/login"
	                     : "/api/v1/private/register";

	if (POSTRequest("www.meteor.com", path, pMBFormData, &pMBDataResponse))
	{
		JSONValue *JSONResponse = JSON::Parse(pMBDataResponse);
		if (JSONResponse != NULL)
		{
			size_t n;

			// Retrieve the main object
			JSONObject JSONRoot;
			if (JSONResponse->IsObject() == false)
			{
				mbstowcs_s(&n, wzErrorMessage, BUF_LEN, pMBDataResponse, BUF_LEN);
			}
			else
			{
				JSONRoot = JSONResponse->AsObject();
				if (JSONRoot.find(L"reason") != JSONRoot.end() && JSONRoot[L"reason"]->IsString())
				{
					StringCchPrintfW(wzErrorMessage, BUF_LEN, JSONRoot[L"reason"]->AsString().c_str());
				}
				else
				{
					bRes = true;

					LPWSTR wzUMSFilePath = NULL;
					LPWSTR wzUMSFileExpPath = NULL;
					if (SUCCEEDED(BalGetStringVariable(WIXSTDBA_VARIABLE_USERMETEORSESSIONFILE, &wzUMSFilePath)))
					{
						if (SUCCEEDED(BalFormatString(wzUMSFilePath, &wzUMSFileExpPath)))
						{
							FileEnsureDelete(wzUMSFileExpPath);
							HANDLE hFile = CreateFileW(wzUMSFileExpPath, GENERIC_ALL, 0, 0L, 1, 0x80L, 0);
							if (hFile != INVALID_HANDLE_VALUE)
							{
								std::string innerSession = pMBDataResponse;
								// In JS this would be: innerSession.userId = innerSession.id; delete innerSession.id;
								innerSession.replace(innerSession.find("\"id\":"), strlen("\"id\":"), "\"userId\":");
								// In JS this would be: innerSession.type = "meteor-account"
								innerSession.replace(innerSession.find("{"), 1, "{\"type\": \"meteor-account\", ");

								// In JS this would be: sessionData = {sessions: {"www.meteor.com": innerSession}}
								std::string sessionData = "{\"sessions\": {\"www.meteor.com\": ";
								sessionData += innerSession;
								sessionData += "}}";

								char sessionDataStr[BUF_LEN];
								strcpy_s(sessionDataStr, BUF_LEN, sessionData.c_str());

								DWORD bytesWritten;
								WriteFile(hFile, sessionDataStr, strlen(sessionDataStr), &bytesWritten, NULL);
								CloseHandle(hFile);
							}
						}
					}
				}
			}
		}
		else {
			wcsncat_s(wzErrorMessage, L"Unknown error.", BUF_LEN-1);
		}

		// Clean up JSON object
		delete JSONResponse;
	} else {
		wcsncat_s(wzErrorMessage, L"Network error contacting the Meteor accounts server. Please retry, or skip this step and complete your registration later.", BUF_LEN-1);
	}


	if (bRes == false)
	{
		wchar_t wzMessage[BUF_LEN] = L"";
		StringCchPrintfW(wzMessage, BUF_LEN, L"%s", wzErrorMessage);
		MessageBoxW(m_hWnd, wzMessage, m_pTheme->sczCaption, MB_ICONEXCLAMATION | MB_OK);
	}

	return bRes;
}


	HRESULT DAPI LocGetString(
		__in const WIX_LOCALIZATION* pWixLoc,
		__in_z LPCWSTR wzId,
		__out LOC_STRING** ppLocString
		)
	{
		HRESULT hr = E_NOTFOUND;
		LOC_STRING* pLocString = NULL;

		for (DWORD i = 0; i < pWixLoc->cLocStrings; ++i)
		{
			pLocString = pWixLoc->rgLocStrings + i;

			if (CSTR_EQUAL == ::CompareStringW(LOCALE_INVARIANT, 0, pLocString->wzId, -1, wzId, -1))
			{
				*ppLocString = pLocString;
				hr = S_OK;
				break;
			}
		}

		return hr;
	}
public:
	//
	// Constructor - intitialize member variables.
	//
	CWixStandardBootstrapperApplication(
		__in HMODULE hModule,
		__in BOOL fPrereq,
		__in IBootstrapperEngine* pEngine,
		__in const BOOTSTRAPPER_COMMAND* pCommand
		) : CBalBaseBootstrapperApplication(pEngine, pCommand, 3, 3000)
	{
		m_hModule = hModule;
		memcpy_s(&m_command, sizeof(m_command), pCommand, sizeof(BOOTSTRAPPER_COMMAND));

		// Pre-req BA should only show help or do an install (to launch the Managed BA which can then do the right action).
		if (fPrereq && BOOTSTRAPPER_ACTION_HELP != m_command.action && BOOTSTRAPPER_ACTION_INSTALL != m_command.action)
		{
			m_command.action = BOOTSTRAPPER_ACTION_INSTALL;
		}
		else // maybe modify the action state if the bundle is or is not already installed.
		{
			LONGLONG llInstalled = 0;
			HRESULT hr = BalGetNumericVariable(L"WixBundleInstalled", &llInstalled);
			if (SUCCEEDED(hr) && BOOTSTRAPPER_RESUME_TYPE_REBOOT != m_command.resumeType && 0 < llInstalled && BOOTSTRAPPER_ACTION_INSTALL == m_command.action)
			{
				m_command.action = BOOTSTRAPPER_ACTION_MODIFY;
			}
			else if (0 == llInstalled && (BOOTSTRAPPER_ACTION_MODIFY == m_command.action || BOOTSTRAPPER_ACTION_REPAIR == m_command.action))
			{
				m_command.action = BOOTSTRAPPER_ACTION_INSTALL;
			}
		}

		m_plannedAction = BOOTSTRAPPER_ACTION_UNKNOWN;

		// When resuming from restart doing some install-like operation, try to find the package that forced the
		// restart. We'll use this information during planning.
		m_sczAfterForcedRestartPackage = NULL;

		if (BOOTSTRAPPER_RESUME_TYPE_REBOOT == m_command.resumeType && BOOTSTRAPPER_ACTION_UNINSTALL < m_command.action)
		{
			// Ensure the forced restart package variable is null when it is an empty string.
			HRESULT hr = BalGetStringVariable(L"WixBundleForcedRestartPackage", &m_sczAfterForcedRestartPackage);
			if (FAILED(hr) || !m_sczAfterForcedRestartPackage || !*m_sczAfterForcedRestartPackage)
			{
				ReleaseNullStr(m_sczAfterForcedRestartPackage);
			}
		}

		m_pWixLoc = NULL;
		memset(&m_Bundle, 0, sizeof(m_Bundle));
		memset(&m_Conditions, 0, sizeof(m_Conditions));
		m_sczConfirmCloseMessage = NULL;
		m_sczFailedMessage = NULL;

		m_sczLanguage = NULL;
		m_pTheme = NULL;
		memset(m_rgdwPageIds, 0, sizeof(m_rgdwPageIds));
		m_dwCurrentPage = 0;
		m_hUiThread = NULL;
		m_fRegistered = FALSE;
		m_hWnd = NULL;

		m_state = WIXSTDBA_STATE_INITIALIZING;
		m_hrFinal = S_OK;

		m_fDowngrading = FALSE;
		m_restartResult = BOOTSTRAPPER_APPLY_RESTART_NONE;
		m_fRestartRequired = FALSE;
		m_fAllowRestart = FALSE;

		m_sczLicenseFile = NULL;
		m_sczLicenseUrl = NULL;
		m_fSuppressOptionsUI = FALSE;
		m_fSuppressDowngradeFailure = FALSE;
		m_fSuppressRepair = FALSE;
		m_fShowVersion = FALSE;
		m_fIsRepair = FALSE;
		m_fIsUninstall = FALSE;
		m_fInstallSucceed = FALSE;
		m_fIsProductCore = FALSE;
		m_sdOverridableVariables = NULL;
		m_pTaskbarList = NULL;
		m_uTaskbarButtonCreatedMessage = UINT_MAX;
		m_fTaskbarButtonOK = FALSE;
		m_fShowingInternalUiThisPackage = FALSE;

		m_fPrereq = fPrereq;
		m_sczPrereqPackage = NULL;
		m_fPrereqInstalled = FALSE;
		m_fPrereqAlreadyInstalled = FALSE;
		m_fOverallInstallationStarted = FALSE;
		m_fUpdating = FALSE;
		m_fOutputToConsole = FALSE;
		m_fAttachedToConsole = FALSE;
		m_fStdConsoleHandle = NULL;

		pEngine->AddRef();
		m_pEngine = pEngine;

		m_hBAFModule = NULL;
		m_pBAFunction = NULL;
	}


	//
	// Destructor - release member variables.
	//
	~CWixStandardBootstrapperApplication()
	{
		CopyBundleLogToSpecifiedPath();
		AssertSz(!::IsWindow(m_hWnd), "Window should have been destroyed before destructor.");
		AssertSz(!m_pTheme, "Theme should have been released before destuctor.");

		if (m_fAttachedToConsole)
		{
			FreeConsole();
		}

		ReleaseObject(m_pTaskbarList);
		ReleaseDict(m_sdOverridableVariables);
		ReleaseStr(m_sczFailedMessage);
		ReleaseStr(m_sczConfirmCloseMessage);
		BalConditionsUninitialize(&m_Conditions);
		BalInfoUninitialize(&m_Bundle);
		LocFree(m_pWixLoc);

		ReleaseStr(m_sczLanguage);
		ReleaseStr(m_sczLicenseFile);
		ReleaseStr(m_sczLicenseUrl);
		ReleaseStr(m_sczPrereqPackage);
		ReleaseStr(m_sczAfterForcedRestartPackage);
		ReleaseNullObject(m_pEngine);

		if (m_hBAFModule)
		{
			::FreeLibrary(m_hBAFModule);
			m_hBAFModule = NULL;
		}
	}

private:
	HMODULE m_hModule;
	BOOTSTRAPPER_COMMAND m_command;
	IBootstrapperEngine* m_pEngine;
	BOOTSTRAPPER_ACTION m_plannedAction;

	LPWSTR m_sczAfterForcedRestartPackage;

	WIX_LOCALIZATION* m_pWixLoc;
	BAL_INFO_BUNDLE m_Bundle;
	BAL_CONDITIONS m_Conditions;
	LPWSTR m_sczFailedMessage;
	LPWSTR m_sczConfirmCloseMessage;

	LPWSTR m_sczLanguage;
	THEME* m_pTheme;
	DWORD m_rgdwPageIds[countof(vrgwzPageNames)];
	DWORD m_dwCurrentPage;
	HANDLE m_hUiThread;
	BOOL m_fRegistered;
	HWND m_hWnd;

	WIXSTDBA_STATE m_state;
	WIXSTDBA_STATE m_stateInstallPage;
	HRESULT m_hrFinal;

	BOOL m_fStartedExecution;
	DWORD m_dwCalculatedCacheProgress;
	DWORD m_dwCalculatedExecuteProgress;

	BOOL m_fDowngrading;
	BOOTSTRAPPER_APPLY_RESTART m_restartResult;
	BOOL m_fRestartRequired;
	BOOL m_fAllowRestart;

	LPWSTR m_sczLicenseFile;
	LPWSTR m_sczLicenseUrl;
	BOOL m_fSuppressOptionsUI;
	BOOL m_fSuppressDowngradeFailure;
	BOOL m_fSuppressRepair;
	BOOL m_fShowVersion;
	BOOL m_fIsRepair;
	BOOL m_fIsUninstall;
	BOOL m_fInstallSucceed;

	BOOTSTRAPPER_RELATED_OPERATION m_Operation;

	BOOL m_fIsProductCore;
	BOOL m_fOverallInstallationStarted;


	STRINGDICT_HANDLE m_sdOverridableVariables;

	BOOL m_fPrereq;
	LPWSTR m_sczPrereqPackage;
	BOOL m_fPrereqInstalled;
	BOOL m_fPrereqAlreadyInstalled;
	BOOL m_fOutputToConsole;
	BOOL m_fAttachedToConsole;
	HANDLE m_fStdConsoleHandle;

	ITaskbarList3* m_pTaskbarList;
	UINT m_uTaskbarButtonCreatedMessage;
	BOOL m_fTaskbarButtonOK;
	BOOL m_fShowingInternalUiThisPackage;

	BOOL m_fUpdating;
	LPCWSTR m_wzUpdateLocation;

	HMODULE m_hBAFModule;
	IBootstrapperBAFunction* m_pBAFunction;
};


//
// CreateUserExperience - creates a new IBurnUserExperience object.
//
HRESULT CreateBootstrapperApplication(
	__in HMODULE hModule,
	__in BOOL fPrereq,
	__in IBootstrapperEngine* pEngine,
	__in const BOOTSTRAPPER_COMMAND* pCommand,
	__out IBootstrapperApplication** ppApplication
	)
{
	HRESULT hr = S_OK;
	CWixStandardBootstrapperApplication* pApplication = NULL;

	pApplication = new CWixStandardBootstrapperApplication(hModule, fPrereq, pEngine, pCommand);
	ExitOnNull(pApplication, hr, E_OUTOFMEMORY, "Failed to create new standard bootstrapper application object.");

	*ppApplication = pApplication;
	pApplication = NULL;

LExit:
	ReleaseObject(pApplication);
	return hr;
}
