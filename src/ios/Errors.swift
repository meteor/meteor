enum WebAppError: ErrorType, CustomStringConvertible {
  case IncompatibleAssetManifest(format: String)
  case DownloadFailure(reason: String, underlyingError: ErrorType?)

  var description: String {
    switch self {
    case .IncompatibleAssetManifest(let format):
      return "The asset manifest format is incompatible: \(format)"
    case .DownloadFailure(let reason, let underlyingError):
      if let underlyingError = underlyingError {
        return "\(reason): \(underlyingError)"
      } else {
        return reason
      }
    }
  }
}
