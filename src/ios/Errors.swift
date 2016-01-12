enum WebAppError: ErrorType, CustomStringConvertible {
  case InvalidAssetManifest(reason: String, underlyingError: ErrorType?)
  case FileSystemFailure(reason: String, underlyingError: ErrorType?)
  case DownloadFailure(reason: String, underlyingError: ErrorType?)
  case UnsuitableAssetBundle(reason: String, underlyingError: ErrorType?)

  var description: String {
    switch self {
    case .InvalidAssetManifest(let reason, let underlyingError):
      return errorMessageWithReason(reason, underlyingError: underlyingError)
    case .FileSystemFailure(let reason, let underlyingError):
      return errorMessageWithReason(reason, underlyingError: underlyingError)
    case .DownloadFailure(let reason, let underlyingError):
      return errorMessageWithReason(reason, underlyingError: underlyingError)
    case .UnsuitableAssetBundle(let reason, let underlyingError):
      return errorMessageWithReason(reason, underlyingError: underlyingError)
    }
  }
}

func errorMessageWithReason(let reason: String, underlyingError: ErrorType?) -> String {
  if let underlyingError = underlyingError {
    return "\(reason): \(underlyingError)"
  } else {
    return reason
  }
}