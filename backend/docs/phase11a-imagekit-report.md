# FindBack AI — Phase 11A ImageKit Verification Report

**Review date:** 2026-11-20  
**Scope:** ImageKit upload and private-image delivery code, plus directly relevant existing tests. No ImageKit provider requests or production access were made.

## Summary

The reviewed code marks found-item uploads private, keeps ImageKit credentials in backend configuration, and issues a short-lived signed URL only after the authenticated user is confirmed to own the found report. Public browse and match responses do not include found-image URLs. The focused existing tests passed.

The tests mock ImageKit URL signing and do not contact ImageKit. Therefore, the live provider rejection of unsigned requests and expired signed requests remains unverified. Production ImageKit account settings were neither inspected nor changed.

**Final status: PARTIALLY VERIFIED — code controls passed; live ImageKit enforcement requires manual verification.**

## Results

| Requirement | Result | Evidence and limits |
|---|---|---|
| Found images are uploaded privately | **Passed — code review** | `createReport` passes `isPrivateFile: type === "found"` to the backend ImageKit upload call. The initial report response uses the default DTO, which omits found image URLs. This confirms the application’s upload request, not the provider account’s effective access policy. |
| ImageKit private key remains backend-side | **Passed — repository review** | ImageKit is initialized in `backend/src/config/imagekit.js` from server environment variables. No frontend private-key reference was found in the reviewed source. No credential values were read or printed. |
| Only authenticated, authorized finders receive found-image access | **Passed — code review and focused test** | The `/:id/image` route uses `protect`. Its controller queries by report ID, `type: "found"`, and authenticated `userId`; non-owners receive 404. The owner-only controller test passed. Found reports returned from the owner’s report views receive signed URLs; ordinary browse is limited to lost reports. |
| Signed URLs have limited expiry | **Passed — code review and focused test** | The signing helper verifies the stored URL is under the configured ImageKit endpoint and clamps `PRIVATE_IMAGE_URL_TTL_SECONDS` to 60–900 seconds, defaulting to 300. The focused test confirmed signing is requested with a 300-second expiry and a `private, no-store` response. |
| Unsigned requests are rejected by ImageKit | **Not verified** | The application requests private uploads and signs delivery URLs, but the test suite stubs signing. Effective enforcement must be confirmed in the ImageKit account/provider. |
| Expired signed requests are rejected by ImageKit | **Not verified** | No provider request was made. Code requests an expiry, but provider-side expiry enforcement is a live-account check. |
| Public `/uploads` access remains disabled | **Passed — focused test** | Existing contract test checks that local upload files are not anonymously served. |

### Failures

No failures occurred in the focused tests. No code-level failure was identified in the reviewed upload/signing/authorization path. Provider-level unsigned and expiry behavior is **unverified**, not a failed test: it was not exercised because this review did not contact ImageKit.

## Focused tests executed

Command executed from `backend/`:

```text
node --test test/privacy.test.js test/appContract.test.js
```

Result: **9 tests passed, 0 failed, 0 skipped.** This run covered public found-report privacy, finder-only report and image access behavior, signed-URL options, restricted match payloads, and the legacy upload static-serving regression. The tests use mocks for ImageKit signing and do not establish live provider behavior.

No unrelated backend, frontend, AI-service, integration, or browser tests were rerun.

## Manual ImageKit verification still required

Use an authorized ImageKit account operator and a non-sensitive test image. Keep credentials and signed URLs private; record only the environment, date, and pass/fail outcomes.

1. In the production ImageKit dashboard, confirm the relevant upload path/account configuration treats found-item files as private and requires signed delivery.
2. Obtain an authorized short-lived image request through the application’s finder flow. Confirm the image is available while the signature is valid, without copying the URL into tickets, chat, or logs.
3. Attempt to request the same private test image without a signature. Confirm the provider denies it.
4. Wait until the signed URL has expired, then retry the same request privately. Confirm the provider denies it.
5. Verify these settings and behaviors in each deployed ImageKit environment, including production. Do not change account settings as part of this verification task.

Do not use real found-item images or disclose private URLs during the checks. If the provider does not reject unsigned or expired access, stop the release review and resolve the ImageKit configuration with the account owner before deployment.

## Files changed

- Created [this report](./phase11a-imagekit-report.md).
- No application code, tests, credentials, ImageKit settings, images, or production data were changed.

## Final status

**PARTIALLY VERIFIED — code controls passed; live ImageKit enforcement requires manual verification.**
