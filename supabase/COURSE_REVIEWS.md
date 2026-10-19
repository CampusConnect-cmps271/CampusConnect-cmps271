# Course review storage — SCRUM-169

`public.course_reviews` stores one review per `(course_id, student_id)`.
The review form is SCRUM-170; averages and display are SCRUM-171/172.

| Field | Contract |
| --- | --- |
| `id` | Generated UUID; immutable for student clients. |
| `course_id` | Existing `courses.id`; immutable after creation. |
| `student_id` | Existing Auth user; defaults to `auth.uid()` and must match the caller. |
| `difficulty_rating` | Whole number 1–5: easiest → hardest. |
| `workload_rating` | Whole number 1–5: lightest → heaviest. |
| `usefulness_rating` | Whole number 1–5: least → most useful. |
| `overall_rating` | Whole number 1–5: lowest → highest overall experience. |
| `body` | Written review, 1–5,000 characters, not whitespace-only; paragraphs preserved. |
| `semester_taken` | Nonblank semester label, at most 80 characters, e.g. `Fall 2026`. |
| `completed_course` | Must explicitly be `true`; a student attestation, not transcript verification. |
| `created_at`, `updated_at` | Server timestamps; update trigger refreshes `updated_at`. |

Ratings use unscaled `numeric` with integer and range checks so fractional
inputs are rejected rather than rounded by an integer-column cast. The client
must still validate the form with Zod and perform the restriction checks in
the server action (SCRUM-170).

Signed-in students can read reviews. They may create reviews as themselves and
edit/delete only their own review. Column grants prevent changing identity,
course or timestamps. Anonymous callers have no access. The maintenance
service role has CRUD access and must remain server-only. The trigger helper
is security-invoker, has an empty search path, and cannot be called as a client
RPC. Deleting the referenced course or Auth user cascades to its reviews.

The unique course/student constraint covers course lookups; additional indexes
support ownership checks and stable newest-first course lists. A later review
query should filter by `course_id`, order by `created_at DESC, id`, and paginate.

## Integration examples for SCRUM-170

Create using the existing authenticated Supabase server client; omit generated
identity and timestamp fields:

```ts
await supabase.from("course_reviews").insert({
  course_id: courseId,
  difficulty_rating: 2,
  workload_rating: 3,
  usefulness_rating: 5,
  overall_rating: 4,
  body: "The project helped me understand the material.",
  semester_taken: "Fall 2026",
  completed_course: true,
});
```

For edits, update only the ratings, `body`, `semester_taken`, and
`completed_course`, filtering by the review ID and current student ID. Do not
spread an entire fetched database row into `.insert()`, `.update()` or
`.upsert()`: protected fields would be rejected. Use an explicit update for
an existing review; a duplicate insert returns SQLSTATE `23505`. Invalid review
constraints return `23514`, missing required fields return `23502`, and
permission/ownership violations return `42501`. Cross-owner update/delete can
also affect zero rows, so check the returned result rather than assuming success.

## Verification

Run the permission tests from `frontend/`:

```bash
node --test tests/course-reviews.test.mjs
```

For hosted verification, run [verify-course-reviews.sql](queries/verify-course-reviews.sql)
in the Supabase SQL Editor as its default database role. It uses two existing
users and a suitable existing course, creates no accounts, and rolls every test
write and session claim back. A successful run returns `PASS`. The same SQL is
tested against PGlite before use on the hosted project.

The test suite covers ownership spoofing, cross-user mutation, duplicate
reviews, immutable columns, fractional/invalid ratings, written-review and
semester limits, confirmation, foreign keys, timestamps, deletion, privileged
maintenance and anonymous access under broad default grants.
