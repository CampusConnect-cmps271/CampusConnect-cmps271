# SCRUM-94: verification email

On October 5, 2026, a real signup delivery test succeeded for an accepted
organization member's AUB inbox. Supabase accepted the signup, returned an
unconfirmed user without a session, and reported sending the confirmation email.
The recipient confirmed receiving a confirmation link. This proves delivery for
that inbox; it does not yet validate the code email template or code-entry flow.

You subsequently reported saving Gmail custom SMTP settings and the code template
in the dashboard. The first signup-confirmation resend timed out locally. After you
reported no new email, one controlled retry with a longer timeout returned HTTP 504
(Gateway Timeout). The Auth log reported `request_timeout` and `context deadline
exceeded`. You then reported correcting the SMTP port from `560` to `587`. One
authorized resend after that correction was accepted by Supabase without an error.
The recipient then provided a screenshot confirming receipt in Junk, the expected
subject, the CampusConnect sender name and template, and an eight-digit code with
no confirmation link. The code itself is not recorded here. The email-delivery
requirement has passed; code submission and account verification remain SCRUM-106.

## Apply the code email template

Keep **Confirm email** enabled in Authentication's signup settings.

**Prerequisite:** configure working custom SMTP first. The project's dashboard
shows "Set up custom SMTP to edit templates." New Free-plan projects created
from June 3, 2026 cannot customize subjects or bodies while using Supabase's
default sender. The previous instructions omitted this restriction. See
[Supabase's change announcement](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).
The prepared HTML remains usable after custom SMTP is configured.

1. Open **Authentication → Emails** in the Supabase dashboard.
2. In the email templates, open **Confirm signup**.
3. Set the subject to **Your CampusConnect verification code**.
4. Replace the template body with the entire contents of
   [templates/confirmation.html](templates/confirmation.html).
5. Save the template.

The `{{ .Token }}` placeholder is replaced by Supabase's one-time verification
code. Keep it exactly as written; do not replace it with a fixed number. This
template uses a code instead of the default confirmation link, matching the
upcoming SCRUM-106 code-entry page. The template file is stored locally for your
team; saving it in the dashboard is what activates it in this cloud project.

The code-entry and resend page is not implemented yet. The template's instructions
describe that planned flow. During this task, check the received email's content;
full verification and expired-code handling will be tested with SCRUM-106.

## Delivery and sender

The initial link-delivery test used Supabase's built-in sender. It sends only to exact
organization-member account addresses, with a documented limit of two emails per
hour. It cannot activate our code template in this new Free-plan project. Our
domain hook also requires the signup email to end in `@mail.aub.edu`.
Gmail custom SMTP is configured, and the code-email delivery test passed for the
tested AUB inbox. The email was classified as Junk. Gmail is used for development testing, with
the sending account as both SMTP username and From address and a Google app password.
Enter SMTP credentials only in Supabase's settings, not the frontend environment.

The template changes the message content, not the From address or sender name.
A custom sender and delivery to other students require custom SMTP setup. Do not
claim an AUB From address without authorization to send from that domain.

## Test the saved template

For the current test, check Inbox and Junk/Spam for the resend accepted after the
SMTP port correction. If no message arrives, inspect the latest Auth logs before
trying again. Do not share SMTP passwords or confirmation codes when reporting
the error. To test a newly saved template, we can send one
signup confirmation resend to the existing unconfirmed test account, using
`supabase.auth.resend({ type: 'signup', email })`. This avoids creating another
account and uses the new template. If the old link has already confirmed the
account, report that before resending so an appropriate test account can be used.

Check the AUB Inbox and Junk/Spam folders. Confirm that the subject and CampusConnect
content are correct, a numeric code replaces `{{ .Token }}`, and the email contains
no confirmation link. A successful API response alone does not prove inbox delivery.
Avoid repeated resend requests if Supabase returns a rate-limit error.

## Registration integration

The registration owner should use the existing Supabase client and call
`supabase.auth.signUp({ email, password })` with the student's form values. With
confirmation enabled, a successful new signup has no authenticated session yet;
the UI should prompt for the verification code. Signup errors, including the
university-domain hook's rejection, must be displayed appropriately.

The current checkout has no registration form. Code-entry, code verification,
resend UI, and invalid/expired-code handling belong to SCRUM-106. Unverified-account
access restrictions belong to SCRUM-116.

No passwords, project keys, or recipient addresses are included in this template
or guide. The local delivery test's generated password stays outside the repository.
SCRUM-94's code-email delivery requirement passed for the tested AUB inbox. This
does not verify account confirmation, code expiry, or access restrictions; those
will be tested with SCRUM-106 and SCRUM-116. The next page should support the
project's configured code length; the received code had eight digits.

References: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[SMTP restrictions and sender configuration](https://supabase.com/docs/guides/auth/auth-smtp),
[signup](https://supabase.com/docs/reference/javascript/auth-signup),
[resending signup confirmation](https://supabase.com/docs/reference/javascript/auth-resend).
