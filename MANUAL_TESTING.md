# Manual journey tests (Sprint 2)

These checks cover what the automated suite (`frontend/tests/e2e/community-journey.spec.ts`)
cannot: the real Supabase database, real row-level security and real browsers.
Run them against a local stack (`npx supabase start`, then `npm run dev` from
`frontend/`) with two AUB test accounts, **Student A** and **Student B**.

Record the result of each step as Pass / Fail with a note. Log any failure as a
Jira bug linked to the story in the **Story** column.

## 1. Posts and feed

| # | Steps | Expected | Story |
| --- | --- | --- | --- |
| 1.1 | As A, open **New post**, fill title, category and body, submit. | You land on the post page; title, category and body match what you typed. | SCRUM-18 |
| 1.2 | Open **Home**. | The new post is first in the feed, with its category, date and `0 upvotes`. | SCRUM-20 |
| 1.3 | Submit **New post** with an empty title, then with no category. | An inline error appears each time and no post is created. | SCRUM-18 |

## 2. Comments and replies

| # | Steps | Expected | Story |
| --- | --- | --- | --- |
| 2.1 | As A, open the post. | "No comments yet. Be the first to comment." is shown; the header says `0 comments`. | SCRUM-27 |
| 2.2 | Write a comment and press **Comment**. | The comment appears at once, marked "You"; the count is `Comments (1)`. | SCRUM-27 |
| 2.3 | The **Comment** button with an empty or spaces-only box. | The button is disabled. | SCRUM-27 |
| 2.4 | Paste 2001 characters and submit. | The box stops at 2000 characters; nothing longer is saved. | SCRUM-27 |
| 2.5 | Sign in as B, open the same post. | A's comment is visible, shown as "CampusConnect student". | SCRUM-27 |
| 2.6 | As B, press **Reply** on A's comment, write a reply, submit. | The reply appears indented under A's comment. | SCRUM-28 |
| 2.7 | Look for **Reply** under B's reply. | There is no Reply button on replies (one level only). | SCRUM-28 |
| 2.8 | Press **Reply**, then **Cancel**. | The reply box closes and the text is discarded. | SCRUM-28 |
| 2.9 | Reload the post as A. | Comments and replies are still there, in the same order. | SCRUM-27 |

## 3. Upvotes

| # | Steps | Expected | Story |
| --- | --- | --- | --- |
| 3.1 | As B, press **Upvote**. | The button shows **Upvoted (1)**. | SCRUM-29 |
| 3.2 | Reload, then go to **Home**. | The upvote is kept and the feed shows `1 upvotes`. | SCRUM-29 |
| 3.3 | Press **Upvoted** again. | The vote is removed; the count returns to 0. | SCRUM-29 |

## 4. Saved posts

| # | Steps | Expected | Story |
| --- | --- | --- | --- |
| 4.1 | As B, open **Saved** from Home. | "You haven't saved any posts yet." | SCRUM-69 |
| 4.2 | Open the post and press **Save**. | The button shows **Saved**. | SCRUM-69 |
| 4.3 | Open **Saved**. | The post is listed; its title opens the post page. | SCRUM-69 |
| 4.4 | Sign in as A and open **Saved**. | B's saved post is **not** shown (saves are private). | SCRUM-69 |
| 4.5 | As B, press **Saved** on the post to unsave, then open **Saved**. | The post is gone from the list. | SCRUM-69 |
| 4.6 | As B, save the post. As A (the author), delete the post. As B, open **Saved**. | The deleted post is not listed and the page does not error. | SCRUM-69 |

## 5. Access and layout

| # | Steps | Expected | Story |
| --- | --- | --- | --- |
| 5.1 | Signed out, open `/saved` and `/posts/new`. | Each redirects to login and returns to that page after sign-in. | SCRUM-75 |
| 5.2 | Open `/posts/00000000-0000-4000-8000-0000000000ff`. | A "not found" page, not an error screen. | SCRUM-75 |
| 5.3 | Open a post with comments at 375 px width (browser dev tools). | No horizontal scrolling; buttons are tappable. | SCRUM-75 |
| 5.4 | Check the Supabase Studio table **post_comments**. | You cannot edit or delete a row as a student; rows have the right `post_id`, `author_id` and `parent_id`. | SCRUM-28 |

## Known gaps to check by eye

- The feed shows `0 comments` for every post: `getFeedPosts` hard-codes
  `comment_count: 0`. Confirm this with the feed owner before filing a bug.
