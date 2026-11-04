# IKAG form security parameters

Applies to every POST to the Apps Script web app (`apps-script/Code.gs`, `screen_()`).
Every rejected post gets the same silent `ok`, with no data row, no email, and no Errors row, so a bot can't tell which rule caught it.

## What the 2026-10-31 → 11-04 flood looked like
- Target: `formType=unsecured-referral` (apply.html). Earlier junk hit deal-submission (Robertshofe, Mickeybrent narcology, formtests.info).
- `clientName`: `* * * <emoji> $1777/$3000/$3,222 ... http(s)://<hacked-site>/go-bv.php|go-na.php?<id> 🔑 ... promo code ... * * *`
- Every other field held 6-character random lowercase+digit filler (`8xcfzb`, `4tcew9`). `clientPhone` was 12 random digits. `repEmail` was a random gmail.com, mail.ru, or 1win.xyz address.
- It sent `referralPartner`, a field the current site doesn't have. That means the bot replays an old form layout and doesn't load the page.
- Rate: 4–5 posts a minute, around the clock. More than 5,000 hit Errors because the long subject made Gmail throw "argument too large: subject".
- The posts came straight to the /exec URL and never ran the site's JS. Apps Script can't see IP, user agent, or referrer, so the defenses below rely on proving that the page actually rendered.

## Parameters (`var SEC` in Code.gs)
| Setting | Value | Effect |
|---|---|---|
| FORM_TOKEN | `ikag-fv1-7Hq2Lm9X` | Must equal `IKAG_FORM_TOKEN` in the 4 pages. The JS sets it at load, and a direct POST doesn't have it. |
| REQUIRE_TOKEN | true | false turns off the token and timestamp checks (emergency rollback). |
| HONEYPOT_FIELD | `website` | Off-screen input. Any value → drop. |
| MIN_FILL_MS | 3000 | Submitted less than 3 s after page render → drop. |
| MAX_AGE_MS | 24 h | Page rendered more than 24 h ago → drop (stops replays). |
| PER_EMAIL_PER_HOUR | 5 | Per submitter email, across all forms. |
| GLOBAL_PER_MINUTE / PER_HOUR | 20 / 120 | Every form combined. Excess is dropped silently. |
| MAX_NAME_LEN | 120 | Names, company, phone, email, and the other short fields. |
| MAX_TEXT_LEN | 5000 | notes, summary, description, trackRecord, address. |
| MAX_LINKS_ANY_FIELD | 1 | 2+ links in one field → drop. Any link, `.ru`, `.xyz`, `.php`, or HTML in a name or company field → drop. |
| MAX_NON_ASCII_RATIO | 0.30 | More than 30% non-ASCII text → drop. Accented names still pass. |
| REJECT_LOG_PER_HOUR | 25 | At most 25 `BLOCKED <kind> [reason]` rows an hour in All Submissions, 2 KB each. |
| ERROR_LOG_PER_HOUR | 30 | Cap on Errors rows, so a flood can't fill the sheet. |
| MAX_SUBJECT_LEN | 180 | Email subjects are clipped. Fixes the "subject too large" error. |

Other rules:
- **Fields the site never sends:** `FOREIGN_FIELDS_` (currently `referralPartner`) → drop.
- **Unknown form types:** dropped.
- **Spam terms:** `BLOCKED_SUBMITTERS` (names, emails, domains, hs= tags) and the `SPAM_RE_` keywords (casino, promo code, go-xx.php, free spins, no deposit, narcolog, viagra, backlinks, and so on) → drop. Words that turn up in real deals, such as "bonus depreciation", "earnest money deposit", and "time slot", are deliberately left out of the keywords.
- **Random filler:** 3+ fields that are 5–8 characters of mixed lowercase letters and digits → drop.
- **Email:** the submitter email must look like `x@y.tld`. Disposable domains (`DISPOSABLE_DOMAINS_`) → drop.
- **Phone:** if a phone is given, it may contain only digits and `+()-. x`, with 7–15 digits.

The `[reason]` on BLOCKED log rows names the rule that fired: token, too-fast, honeypot, foreign-field, blocklist, keywords, links, random-filler, rate-email, and so on.

## Tuning
- **Legit post dropped:** look in All Submissions for `BLOCKED … [reason]`, then loosen that one setting. For a keyword, remove it from `SPAM_RE_`.
- **New spam domain or name:** add it to `BLOCKED_SUBMITTERS`.
- **Token leaked or the bot adapts:** change FORM_TOKEN in Code.gs and in the 4 HTML pages together.
- **After any Code.gs change:** test locally with `node apps-script/test/doPost.test.js`, then deploy a New version.

## Next step (optional): CAPTCHA
Turn on Cloudflare Turnstile (free) or reCAPTCHA v3. Kevin creates the site key and secret. The widget goes on the 4 forms, and Code.gs verifies the token with `UrlFetchApp` against `https://challenges.cloudflare.com/turnstile/v0/siteverify`. The secret goes in Script Properties, not in the code. No keys have been added.

## Deploy order (important)
1. Push the site HTML first (GitHub Pages: commit and push to the Pages branch). Wait until the live pages show the `_tk` hidden input, about 1–10 min.
2. Then in Apps Script, paste Code.gs, then Deploy → Manage deployments → pencil → Version: New version → Deploy. The /exec URL stays the same.

If you deploy the script before the site is live, real visitors' posts are dropped as `token`. To avoid that, either follow the order above or deploy with `REQUIRE_TOKEN: false` first.
