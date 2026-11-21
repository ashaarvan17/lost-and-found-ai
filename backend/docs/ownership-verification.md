# Ownership verification configuration

The backend policy defaults are:

| Value tier | Required correct | Questions |
| --- | ---: | ---: |
| Low | 2 | 3 |
| Intermediate | 4 | 5 |
| High | 5 | 5 |

Configure these optional variables in `backend/.env`:

```dotenv
OWNERSHIP_LOW_REQUIRED_CORRECT=2
OWNERSHIP_INTERMEDIATE_REQUIRED_CORRECT=4
OWNERSHIP_HIGH_REQUIRED_CORRECT=5
OWNERSHIP_MAX_ATTEMPTS=3
OWNERSHIP_LOCKOUT_HOURS=24
ITEM_VALUE_LOW_MAX_INR=2000
ITEM_VALUE_INTERMEDIATE_MAX_INR=10000
```

The backend validates that every pass threshold is positive and does not exceed
the question count for its tier. Invalid settings fail closed when verification
policy is loaded. Answer verifiers use per-answer salts; expected answer text is
not stored in the verifier or returned by claimant-facing APIs. Found-report
value tiers are assigned server-side from the INR thresholds and cannot be
lowered through user routes. The existing `admin` role is treated as Main Admin
for audited tier elevations and the review queue.

Found reports require finder-authored questions and answers: 3 for Low, 5 for
Intermediate, and 5 for High. Claim creation snapshots those prompts/verifiers
and the applicable policy. Failed attempts are persisted without storing
submitted answers; the third failure locks the claim for 24 hours and puts it
in the Main Admin review queue.
