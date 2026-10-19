# Course rating averages — SCRUM-171

`public.course_rating_averages` is a regular Postgres view. Each query calculates
the current results from `courses` and `course_reviews`, so committed inserts,
edits and deletions are reflected on the next read without triggers, scheduled
jobs or materialized-view refreshes. Transaction visibility follows Postgres'
normal isolation rules.

| Column | Contract |
| --- | --- |
| `course_id` | UUID referencing the existing course. One row per visible course. |
| `review_count` | `bigint` count of visible review rows; `0` for an empty course. |
| `average_difficulty` | Numeric mean of difficulty ratings, 1 = easiest, 5 = hardest. |
| `average_workload` | Numeric mean of workload ratings, 1 = lightest, 5 = heaviest. |
| `average_usefulness` | Numeric mean of usefulness ratings, 1 = least useful, 5 = most useful. |
| `average_overall` | Numeric mean of overall experience ratings, 1 = lowest, 5 = highest. |

An empty course has four `NULL` averages; missing ratings are never converted
to zero. Numeric means retain database precision instead of being rounded for
display. Each student contributes one review per course under the existing
SCRUM-169 unique constraint. Courses are grouped by immutable UUID, not title,
department or semester. Changing review wording does not change ratings/count.

## Permissions and performance

The view uses `security_invoker = true`, so both the `courses` and
`course_reviews` grants and SELECT policies apply as the requesting role.
Authenticated callers and the server-only maintenance role have explicit
SELECT access to the view; anonymous callers and all client writes are denied.
The view exposes no student identities, written feedback or semester values.
No privileged function, new table, RLS bypass or additional index is needed.
Existing course PK and review course-prefix indexes support filtered queries.

Use the existing authenticated Supabase client, filter to the displayed course
or page of course IDs, and handle query errors separately from empty ratings:

```ts
const { data, error } = await supabase
  .from("course_rating_averages")
  .select("course_id,review_count,average_difficulty,average_workload,average_usefulness,average_overall")
  .eq("course_id", courseId)
  .maybeSingle();
```

For course cards, replace `.eq(...).maybeSingle()` with
`.in("course_id", displayedCourseIds)` to fetch one batch, rather than one query
per card. Catalogue imports/renames keep stable course IDs. Unknown or
RLS-hidden course IDs return no row, not an invented zero-rating course.

The **three-review display threshold** belongs to SCRUM-172. This view returns
accurate counts and averages even at one or two reviews. The UI must show
“not enough reviews yet” when `review_count < 3`, and round only for display.
The view is not an anonymity boundary; signed-in students already have read
access to the underlying reviews under SCRUM-169.

## Verification

From `frontend/`, run:

```bash
node --test tests/course-rating-averages.test.mjs
```

Tests exercise empty courses, independent dimensions/courses, decimal
precision, owner inserts/edits/deletions, cascades, grants and invoker RLS.
They also run the exact [hosted verification SQL](queries/verify-course-rating-averages.sql)
against PGlite. That SQL uses two existing Auth users and a course without
reviews, switches to authenticated/anonymous roles, and rolls all synthetic
writes and session claims back. Run it as the SQL Editor's default role.

Reference: [Supabase view security](https://supabase.com/docs/guides/database/views#view-security).
