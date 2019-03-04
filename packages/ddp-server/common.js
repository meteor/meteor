// Audit argument checks, if the audit-argument-checks package exists (it is a
// weak dependency of this package).
export function maybeAuditArgumentChecks(f, context, args, description) {
  args = args || [];
  if (Package['audit-argument-checks']) {
    return Match._failIfArgumentsAreNotAllChecked(
      f, context, args, description);
  }
  return f.apply(context, args);
}
