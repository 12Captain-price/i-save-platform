# Registration fee and membership workflow

The subsequent [savings contributions and reconciliation milestone](savings-contributions.md) introduces ledger-backed, currency-separated confirmed savings. Legacy Verified contribution rows do not count as reconciled savings. Registration fees and subscriptions remain separate; existing amounts, obligations and accepted terms are unchanged.

Local activation and test evidence are recorded in
[membership validation](membership-validation.md).

The agreed registration fee is US$20. Recording payment, verification, membership
approval and account activation are four explicit, separately audited actions.
Viewing a record or ticking a reviewer acknowledgement cannot post or verify a
payment. Savings-category interest remains separate from plan approval.

## Permissions and review

The protected Staff/Admin Applications detail contains the payment status,
receipt/reference, payment date, recorder and verifier identities/timestamps,
review acknowledgement snapshot and approval/activation history. Actions use the
authenticated session actor; actor IDs in request bodies are rejected.

| Action | Dedicated permission | Conditions |
| --- | --- | --- |
| Record US$20 payment | `registration-fees:record` | Pending unlinked application; USD 20; actual payment date; unique receipt/reference |
| Verify recorded fee | `registration-fees:verify` | Existing USD 20 payment; explicit action |
| Approve membership | `membership:approve` | Staff/Admin; verified USD 20; current review acknowledgement; pending unlinked application; no conflicting account |
| Activate account | `membership:activate` | Staff/Admin; existing approval and verified payment |
| Issue invitation | `invitations:issue` | Staff/Admin; activated member account without a password; approved delivery adapter available |

Administrators receive these known capabilities at migration/bootstrap. Staff and
Finance receive no new automatic grant. Staff with the explicit permissions may
record and verify **the same payment**, including when they are the same employee.
Both actions retain separate authenticated actors, timestamps and financial
snapshots in audit. Finance may receive recording/verification permissions but
cannot approve or activate membership. Members cannot acquire these actions via
an inappropriate role or a client-supplied identifier. Reviewing application
details separately requires `applications:read`.

Approve remains visible but disabled until backend prerequisites and the unticked
review acknowledgement are satisfied. The server independently enforces both.
Approval creates one inactive member account and one member, retains the exact
review wording/version and links the application. Existing accounts are never
silently reused, promoted or overwritten: conflicts require reconciliation.
Legacy account administration cannot activate or repurpose these workflow accounts.

Activation links the **existing** application payment to that member, without
copying it into legacy registration fees or contributions. The member Fees screen
shows “Registration fee — US$20 — Paid”, its actual reference/date and subscriptions.
Savings totals still sum verified contributions only. Historical fee rows remain
separate and unchanged. Activation records the first US$5 subscription in the
following calendar month in Africa/Harare time, with no due date. Automatic
subsequent monthly billing is not implemented by this change.

Application row locks serialize changes; PostgreSQL advisory locks serialize
normalised receipt/reference and email checks. The application payment primary
key, unique reference hash and unique approval links enforce duplicate protection.
Exact payment retries and repeated verification/approval/activation are no-ops,
without duplicate financial entries or audit events. Conflicting corrections and
refunds remain unavailable. Refresh after an uncertain response before retrying.

## Password setup and delivery boundary

Development can now opt into [local Mailpit testing](local-invitation-email.md).
The unavailable-provider description below remains the external/production
boundary. Invitation attempts are now reserved before SMTP; uncertain attempts
are retained and never automatically resent, as documented in the local runbook.

Only a SHA-256 hash of the 256-bit random invitation token is stored. It expires
after 60 minutes by default (`PASSWORD_SETUP_EXPIRE_MINUTES`, bounded 5–1440), is
single-use, and is revoked when a replacement is issued. Consumption locks the
application/account, sets the password and revokes sessions atomically. It cannot
approve membership, activate an account or log the applicant in automatically.
Invalid, expired, revoked and consumed links receive a uniform error.

The browser accepts a token in the private setup URL fragment, immediately removes
the fragment and sends it in a same-origin, CSRF-protected POST. It stores neither
the token nor password in browser storage. Production requires HTTPS.

**Email delivery is unavailable in this deployment.** No approved provider or
credentials were present, and the production dependency intentionally uses an
unavailable adapter. Public contact email is not delivery configuration. Before
enabling delivery, implement and review a provider adapter with an approved sender,
credentials, a fixed approved HTTPS setup URL, provider idempotency using the
request key and safe evidence/error handling. Never construct the setup origin
from a browser Host header. No raw invitation token may be returned to reviewers
or written to logs. No email-sent claim is made without provider evidence.

The provider seam is tested with synthetic acceptance/failure evidence; no real
email was delivered. A successful provider acceptance records its message reference
and is not an inbox-delivery guarantee. Retrying the same invitation request key
does not repeat approval, activation, payment or provider acceptance. Unknown
delivery attempts are now retained and never automatically resent. Failed attempts
are revoked; an explicit replacement uses a new request key and invalidates older
links. Membership/payment remain unchanged. See the local Mailpit runbook for
the durable pre-send reservation and SMTP uncertainty boundary.

## Policy limits

Refund handling remains unconfigured and unavailable. The subscription due day,
identity-document requirements, additional eligibility rules and formal savings
plan terms have not been invented. Any newly approved prerequisites must be added
to both server checks and the displayed prerequisite response before enabling them.

## Migration and recovery

Revision `0007_membership_activation` adds three tables:
`application_registration_payments`, `membership_approvals` and
`password_setup_invitations`. It adds exactly five permission catalog entries and
their canonical administrator grants; old grants/denials and business rows remain.
It does not infer payments, approve applications or activate historical accounts.

Before upgrading an existing database, stop writers, create a private custom-format
PostgreSQL dump outside the checkout, verify its hash, restore into a separate
recovery database and compare original rows/schema. Rehearse 0007 there and compare
again, allowing only the five known permission additions and Admin grants. Then
upgrade the existing database and repeat preservation/readiness checks. See
[database operations](database-operations.md). Never force-stamp or delete volumes.

Downgrade refuses populated workflow tables and retained submission/interest
history before dropping tables. Keep the backup and recovery database; rollback
after new business activity requires reviewed recovery rather than deleting records.
