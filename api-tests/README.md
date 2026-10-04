# CampusConnect API tests

Two layers of tests cover every API endpoint (SCRUM-22):

| Layer | Where | What it needs |
|---|---|---|
| **Manual** (SCRUM-89) | [`CampusConnect.postman_collection.json`](CampusConnect.postman_collection.json) | The app running against a real Supabase project |
| **Automated** (SCRUM-101) | [`frontend/tests/`](../frontend/tests) (Vitest) | Nothing. Supabase is mocked |

## Running the automated tests

```bash
cd frontend
npm install
npm test
```

They call the route handlers directly with a fake Supabase client, so they run offline and in CI.

## Running the manual collection

1. Start the app with real Supabase keys in `frontend/.env` (see the [root README](../README.md)), then run `npm run dev`.
2. In Postman, choose **Import** and pick `CampusConnect.postman_collection.json`.
3. Open the collection's **Variables** tab and set:
   - `baseUrl`: `http://localhost:3000`, or the deployed URL.
   - `email`: a test account that exists in Supabase and whose inbox you can read.
   - `newPassword`: a password that meets the policy and differs from the current one.
4. Run **FP-01**, open the email, and put the code in the `code` variable.
5. Run the remaining requests. Run **RP-01** before **RP-09**, because RP-09 checks that a used code is rejected.

Each request has Postman test scripts, so you can also use **Run collection**. Run it after setting `code`, and expect RP-01 to pass only once per code.

> Supabase rate-limits recovery emails to a few per hour by default. Running FP-01/FP-03 repeatedly may return `429 RATE_LIMITED`, which is itself a correct result.

## Test cases

### `POST /api/auth/forgot-password`: `{ email }`

| ID | Case | Expected |
|---|---|---|
| FP-01 | Registered email | `200` + generic message, and an email with a code arrives |
| FP-02 | Unregistered email | `200` + **the same** generic message (no account enumeration) |
| FP-03 | Email with spaces and upper case | `200`, normalised to lower case |
| FP-04 | Missing email | `400 VALIDATION_FAILED`, `fields.email` |
| FP-05 | Malformed email | `400 VALIDATION_FAILED`, `fields.email` |
| FP-06 | Email is a number | `400 VALIDATION_FAILED`, `fields.email` |
| FP-07 | Body is not JSON | `400 INVALID_JSON` |
| FP-08 | Body is a JSON array | `400 INVALID_JSON` |
| FP-09 | `GET` instead of `POST` | `405` |
| — | Too many requests | `429 RATE_LIMITED` |
| — | Supabase down or not configured | `503 SERVICE_UNAVAILABLE` |

### `POST /api/auth/reset-password`: `{ email, code, newPassword, confirmPassword }`

| ID | Case | Expected |
|---|---|---|
| RP-01 | Correct code + valid password | `200`; you can log in with the new password and old sessions are revoked |
| RP-02 | Empty body | `400 VALIDATION_FAILED`, all four fields flagged |
| RP-03 | Non-numeric code | `400 VALIDATION_FAILED`, `fields.code` |
| RP-04 | Password shorter than 8 | `400 VALIDATION_FAILED`, `fields.newPassword` |
| RP-05 | Password without a symbol | `400 VALIDATION_FAILED`, `fields.newPassword` |
| RP-06 | Confirmation does not match | `400 VALIDATION_FAILED`, `fields.confirmPassword` |
| RP-07 | Body is not JSON | `400 INVALID_JSON` |
| RP-08 | Wrong code | `400 INVALID_OR_EXPIRED_CODE` |
| RP-09 | Code reused after a successful reset | `400 INVALID_OR_EXPIRED_CODE` |
| RP-10 | Unregistered email | `400 INVALID_OR_EXPIRED_CODE` (same as a wrong code) |
| RP-11 | `GET` instead of `POST` | `405` |
| — | Code older than the OTP expiry (default 1 hour) | `400 INVALID_OR_EXPIRED_CODE` |
| — | New password equals the old one | `400 SAME_PASSWORD` |
| — | Too many attempts | `429 RATE_LIMITED` |

### Missing tokens and wrong roles

Both current endpoints are deliberately public: a locked-out user has no token. When protected endpoints are added (feed, clubs, admin and so on), add these cases to the collection and to `frontend/tests/api/`:

- no `Authorization` header / no session cookie → `401`
- expired or tampered token → `401`
- a valid student token on a moderator/admin endpoint → `403`

## Error format

Every error response has the same shape:

```json
{ "error": "VALIDATION_FAILED", "message": "Some fields are missing or invalid.", "fields": { "email": "Enter a valid email address." } }
```

`fields` is only present for `VALIDATION_FAILED`.
