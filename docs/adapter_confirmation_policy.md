# Adapter command confirmation policy

Command metadata distinguishes data mutation from a second user confirmation:

```json
{
  "safety": "write",
  "requires_confirmation": false
}
```

The optional boolean `requires_confirmation` defaults to true for writes and false for reads. Set it to false only for commands approved to execute directly when the user requests the action and its parameters are clear. Keep `safety: "write"`; this remains a data-changing command.

The policy belongs to the versioned manifest and its content digest, not invocation arguments. CLI, Bridge, Extension routing and v2 bootstrap enforce the selected package policy. Canonical and legacy command names resolve to the same policy. Toolkit commands use the CLI/Bridge gate before entering their existing Runner.

With true, obtain confirmation before submission and pass the existing boolean `__confirmed: true`. With false, no second confirmation or manual Execute click is required; callers do not need to supply `__confirmed`. Generated Skills and help expose the policy.

Changing an installed write command from confirmation-required to false adds an `unconfirmed-write:<command-id>` package permission, using the existing permission-change review mechanism. Builtin changes are reviewed with the source update. Automatically generated write drafts retain the default confirmation policy and their existing verification requirements.

For explicitly opted-out write commands, the v2 bootstrap passes a fresh argument object with the internal compatibility grant `__confirmed: true` to the handler. This satisfies preserved legacy confirmation guards without changing caller arguments or shared runtime state. Read commands (including conditional write branches) never receive this grant. The field does not bypass business-side approvals, required parameters, login, dry-run controls or business operation selectors such as save versus submit. It also does not authorize actions the user did not request.
