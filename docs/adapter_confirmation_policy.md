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

With true, obtain confirmation before submission and pass the existing boolean `__confirmed: true`. With false, no second confirmation or manual Execute click is required; do not synthesize `__confirmed`. Generated Skills and help expose the policy.

Changing an installed write command from confirmation-required to false adds an `unconfirmed-write:<command-id>` package permission, using the existing permission-change review mechanism. Builtin changes are reviewed with the source update. Automatically generated write drafts retain the default confirmation policy and their existing verification requirements.

This field does not bypass business-side approvals, required parameters, login, dry-run controls, or explicit checks inside a legacy handler. Those checks require separate review when choosing a command policy. It also does not authorize actions the user did not request.
