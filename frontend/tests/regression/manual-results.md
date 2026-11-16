# SP4-32 | Completed guided manual regression results

**Jira:** SCRUM-274  
**Project:** CampusConnect  
**Branch:** `mohammed/sprint-4`  
**Execution date:** 2026-11-15 (Asia/Beirut, as reported in conversation)  
**Environment:** Local development application (`http://localhost:3000`)  
**Tester:** Project team member (name not provided for this report)  
**Browser:** Chrome used for mobile emulation; other browser details not recorded  
**Commit SHA:** Not provided  
**Evidence:** Tester-reported results in the ChatGPT SP4-32 guided-testing conversation; no screenshots or external execution logs were supplied.

## Summary of the guided manual run

| Metric | Result |
|---|---:|
| Guided manual test cases | 20 |
| Tester-reported PASS | 20 |
| Tester-reported FAIL | 0 |
| Tester-reported BLOCKED | 0 |
| Not run in guided sequence | 0 |
| Reported pass rate | 100% |

**Overall result for the guided manual sequence:** PASS, based on the tester's explicit confirmation for each case. This records tester observations, not independently verified execution evidence. The report's scope is the **guided sequence**, which differs in some places from the original SP4-32 checklist (see reconciliation below).

## Detailed guided test outcomes

| Test ID | Scenario tested | Reported result | Tester-reported actual outcome |
|---|---|---|---|
| MR-01 | Signed-out route protection | **PASS** | `/home`, `/profile`, and `/courses` redirected to login while signed out. |
| MR-02 | Login and logout | **PASS** | Login worked, protected Home was accessible while authenticated, and logout restored access restrictions. |
| MR-03 | Registration validation | **PASS** | Empty or invalid registration fields were rejected with validation feedback. |
| MR-04 | Password recovery | **PASS** | Tester confirmed the guided password recovery and validation steps worked. |
| MR-05 | Profile editing and saving | **PASS** | Saved profile changes persisted after refresh; canceled changes were not saved. |
| MR-06 | Create and view a post | **PASS** | Test post appeared in the feed and persisted after refresh. |
| MR-07 | Edit an existing post | **PASS** | Edited title/content persisted after refresh. |
| MR-08 | Delete an existing post | **PASS** | Deleted post remained removed after refresh. |
| MR-09 | Comments on posts | **PASS** | Test comment appeared on the relevant post and persisted after refresh. |
| MR-10 | Course browsing and search | **PASS** | Course list, search, and course details loaded correctly. |
| MR-11 | Course enrollment and unenrollment | **PASS** | Enrollment and unenrollment state changes persisted after refresh. |
| MR-12 | Direct messaging | **PASS** | Test messages and replies appeared in the correct conversation and persisted. |
| MR-13 | Messaging validation and access control | **PASS** | Blank messages were rejected; unauthorized account access to conversations was denied. |
| MR-14 | Notifications | **PASS** | Notifications displayed relevant activity, navigated correctly, and preserved read state. |
| MR-15 | Admin access control | **PASS** | Student account was denied admin pages; administrator account could access admin dashboards. |
| MR-16 | API availability dashboard | **PASS** | Availability page and 24-hour, 7-day, and 30-day reporting periods worked. |
| MR-17 | Error monitoring dashboard | **PASS** | Admin error dashboard loaded and access restrictions worked. |
| MR-18 | Mobile responsiveness | **PASS** | Home, Community, Courses, Messages, and Profile were usable in a mobile-sized viewport. |
| MR-19 | Form validation and error handling | **PASS** | Required post fields were validated and corrected submission worked without duplicate posts. |
| MR-20 | Final end-to-end smoke journey | **PASS** | Login, profile, community post, courses, messages, notifications, deletion, and logout worked together. |

**Important:** These outcome descriptions summarize what the user indicated by selecting PASS for each guided test. No individual logs or screenshots were provided to independently establish the results.

## Reconciliation with the originally downloaded SP4-32 checklist

The initial `SP4-32_manual_regression_checklist.md` was not identical to the guided sequence used in this chat. Some originally specified coverage was not directly established by the 20 PASS responses. To avoid overclaiming, the following original checks need separate confirmation if the Jira acceptance criteria require the **original** list in full:

| Original checklist item | Additional verification not established by the guided run | Status |
|---|---|---|
| Original MR-03: Invalid login | Incorrect passwords and invalid login addresses were not explicitly exercised in the guided MR-03 (which instead tested registration). | **Not verified** |
| Original MR-08: Comment and reply | A comment was tested, but a threaded reply to a comment was not explicitly tested. | **Not verified** |
| Original MR-09: Upvote and save | Upvote count, saved-post list, and unsave behavior were not included. | **Not verified** |
| Original MR-11: Filter and paginate courses | Department filtering, pagination and reset-on-new-search were not explicitly tested. | **Not verified** |
| Original MR-12: Course details and empty state | Course details were covered, but an impossible-code search and empty-results state were not explicitly tested. | **Partially verified** |
| Original MR-13: Planner basic flow | Add course/section, schedule conflict, and calendar view were not included. | **Not verified** |
| Original MR-20: Basic runtime stability | User journeys succeeded, but the browser console and network-failure inspection were not explicitly recorded. | **Partially verified** |

All other comparable checks can be traced to one or more guided cases. The guided test report is complete, but **full coverage of the original checklist is not yet established**. Do not represent those seven original-case checks as passed without additional testing.

## Defect and evidence record

- **Reported defects during the guided run:** None.
- **Screenshots, recordings, issue links, or browser logs:** None provided.
- **Remaining issues:** Original-checklist coverage gaps listed above, not confirmed application defects.
- **Security-sensitive data:** No credentials or private message contents recorded.

## Final record

- **Guided run:** Completed, 20 PASS / 0 FAIL / 0 BLOCKED.
- **Original checklist:** Additional checks pending if required for acceptance.
- **Recommendation:** Commit this report as the completed guided manual test evidence and, if Jira requires exact original-checklist coverage, verify and append results for the gaps before closing SP4-32.
- **Reviewer sign-off:** Not recorded.

## Git commands

Place this file at `frontend/tests/regression/manual-results.md` from the repository root and commit it:

```powershell
cd "C:\Users\Lenovo\Desktop\CampusConnect-cmps271"
New-Item -ItemType Directory -Force frontend\tests\regression | Out-Null
Copy-Item "$env:USERPROFILE\Downloads\SP4-32_completed_manual_regression_results.md" "frontend\tests\regression\manual-results.md" -Force
git add frontend/tests/regression/manual-results.md
git commit -m "SP4-32 Record manual regression test results"
git push origin mohammed/sprint-4
```

Do not commit test passwords or private message data. This documentation update does not require an npm dependency installation.
