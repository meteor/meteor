enum WebAppError: Error, CustomStringConvertible {
  case invalidAssetManifest(reason: String, underlyingError: Error?)
  case fileSystemFailure(reason: String, underlyingError: Error?)
  case downloadFailure(reason: String, underlyingError: Error?)
  case unsuitableAssetBundle(reason: String, underlyingError: Error?)

  var description: String {
    switch self {
    case .invalidAssetManifest(let reason, let underlyingError):
      return errorMessageWithReason(reason, underlyingError: underlyingError)
    case .fileSystemFailure(let reason, let underlyingError):
      return errorMessageWithReason(reason, underlyingError: underlyingError)
    case .downloadFailure(let reason, let underlyingError):
      return errorMessageWithReason(reason, underlyingError: underlyingError)
    case .unsuitableAssetBundle(let reason, let underlyingError):
      return errorMessageWithReason(reason, underlyingError: underlyingError)
    }
  }
}

func errorMessageWithReason(_ reason: String, underlyingError: Error?) -> String {
  if let underlyingError = underlyingError {
    return "\(reason): \(underlyingError)"
  } else {
    return reason
  }
}
