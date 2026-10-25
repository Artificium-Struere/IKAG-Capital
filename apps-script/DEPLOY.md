# Form and listings backend: deploy and verify

Everything here is done signed in as **contact@ikag.capital**. The script
sends mail as whichever account owns it, so signing in as anyone else means
redoing it.

Work through the steps in order. Each one ends with a check. If a check fails,
stop there: the steps after it depend on it.

## 0. Check the live access setting before touching code

No submission has ever reached the Sheet. The likely cause is the access
setting on the deployment the site already uses, so check that first.

1. Open the **IKAG Submissions** spreadsheet → **Extensions → Apps Script**.
2. **Deploy → Manage deployments**. Find the deployment whose Web app URL
   contains `AKfycbxUo7xknwFyCSt07JdqpXZtEoc-1mzbcULqMHYFSNaibaJ2IT4EvB6boXtEZFwQQ_MG2A`.
   That is the one all four pages post to.
   - If that ID is not in the list, the site points at a deployment this
     script does not own. Write down the URL that *is* listed and see step 5.
3. Click the **pencil** on it and read the two settings:
   - Execute as: **Me (contact@ikag.capital)**
   - Who has access: **Anyone**

   *Anyone within ikag.capital* is wrong, however correct it looks. It sends
   anonymous visitors to a Google sign-in page. The apply and contact forms
   post into a hidden iframe and never read the reply, so the visitor still
   sees the thank-you panel while nothing is recorded.

   If *Anyone* is not offered at all, a Workspace admin has blocked public
   web apps. In the Admin console go to **Apps → Google Workspace → Drive and
   Docs → Sharing settings** and allow sharing outside ikag.capital. Then
   come back to this step.
4. Close the dialog without deploying. Changing the code comes in step 1.

**Check:** open this in a **private window** (not signed in to Google):

    https://script.google.com/macros/s/AKfycbxUo7xknwFyCSt07JdqpXZtEoc-1mzbcULqMHYFSNaibaJ2IT4EvB6boXtEZFwQQ_MG2A/exec

- JSON (anything starting with `{"ok":`) means access is right.
- A Google sign-in page means access is wrong. Fix it in step 3 above.
- "Script function not found: doGet" means access is right but the deployed
  version is older code. Step 1 fixes that.

## 1. Paste the script

1. In the Apps Script editor, select everything in `Code.gs` and replace it
   with the contents of `Code.gs` from this folder. It is a complete
   replacement and already contains the referral and deal handlers.
2. Near the top, set `NOTIFY_EMAIL`. Keep `contact@ikag.capital` first and
   add one outside address after a comma, e.g.

       var NOTIFY_EMAIL = 'contact@ikag.capital,someone@gmail.com';

   This is why: the script runs as contact@ikag.capital, and Gmail can file a
   message you send to yourself under Sent instead of the inbox. The outside
   address is never both sender and recipient, so it always gets the alert.
3. Save.

## 2. Run `setup` once

Choose `setup` in the function dropdown, then click **Run**.

It creates any missing tabs and the Drive folder **IKAG Listing Photos**.
Tabs that already exist are left alone.

| Tab | What goes in it |
| --- | --- |
| All Submissions | every POST, written before any parsing (photo data shortened) |
| Unsecured Referrals | apply.html |
| Deal Submissions | contact.html |
| IKAG Listings | list-property.html; status starts as `Pending` |
| Listing Inquiries | listings.html inquiry modal |
| Errors | anything that failed, with the submission it belonged to |

The first run asks for permissions, including Drive. Click **Advanced → Go to
IKAG Submissions (unsafe)**. It is your own script.

`setup` finishes by calling `diagnose`, which you can run on its own at any
time. Open **Execution log** and check:

- `Script runs as:` reads `contact@ikag.capital`.
- `Mail quota left:` shows the daily number. Every recipient counts,
  including the rep's copy on a referral. At 100/day that is roughly 40 to
  50 submissions.
- One message titled `IKAG alert test to <address>` was sent to each
  address in `NOTIFY_EMAIL`.

**Check:** look in each inbox for its test message.

- If contact@ikag.capital does not have it in the Inbox, search
  `in:anywhere subject:"IKAG alert test"`. If it shows up under Sent only,
  that is the self-addressed filing described above. The second address
  covers it. You can also try a plus-address, `contact+alerts@ikag.capital`,
  in `NOTIFY_EMAIL` and run `diagnose` again. Gmail delivers plus-addresses
  as incoming mail, but test it before relying on it.
- If the outside address did not get its message either, check its spam
  folder before going further.

## 3. Publish the new code to the existing URL

Editing the script does **not** change what is live.

**Deploy → Manage deployments → pencil on the deployment from step 0 →
Version: New version → Deploy**

Confirm the two access settings are still **Me** and **Anyone** before
clicking Deploy.

Do **not** use *New deployment*. That makes a new URL and leaves the old code
serving the site. It is the usual reason a fix seems to do nothing.

**Check:** run `diagnose` again. `Live web app URL:` must contain
`AKfycbxUo7xkn…`. Then, in a private window:

- `…/exec` returns `{"ok":true,"listings":[]}`
- `…/exec?action=ping` returns `{"ok":true,"message":"IKAG endpoint is live.",…}`

## 4. Prove each form end to end

Do each one from the live site, in a normal browser window. After each,
expect a row in "All Submissions", a row in the form's own tab, and an alert
in every `NOTIFY_EMAIL` inbox. Nothing should appear in "Errors".

| Page | What to submit | Tab | Alert subject |
| --- | --- | --- | --- |
| ikag.capital/apply.html | test client, rep email = an inbox you can read | Unsecured Referrals | `New client from …` (the rep also gets `Received: …`) |
| ikag.capital/contact.html | test deal | Deal Submissions | `New deal: …` |
| ikag.capital/list-property.html | test listing with **3 or more photos** | IKAG Listings | `New property listing IKAG-0001: …` |
| ikag.capital/listings.html | inquiry on an approved listing (after step 6) | Listing Inquiries | `Listing inquiry on IKAG-0001 …` |

For the listing, also check Drive: **IKAG Listing Photos → IKAG-0001** holds
the photos, and each one's sharing reads *Anyone with the link: Viewer*.

If a row appears but no alert arrives, or the reverse, read "Errors". Every
failure is written there, and the script also tries to mail it with the
subject `IKAG website problem: …`.

## 5. Only if the URL had to change

If step 0 found the site pointing at a deployment this script does not own,
the deployment from step 3 has a different URL. If that URL looks like

    https://script.google.com/a/macros/ikag.capital/s/AKfy.../exec

remove `/a/macros/ikag.capital` so it reads

    https://script.google.com/macros/s/AKfy.../exec

It appears once in each of `apply.html`, `contact.html`, `list-property.html`
and `listings.html`. Replace it in all four at once:

```bash
grep -rl 'script.google.com/macros/s/' *.html \
  | xargs sed -i 's#https://script.google.com/macros/s/[^"]*/exec#NEW_URL_HERE#g'
```

## 6. Approve the test listing

A submission lands in **IKAG Listings** with status `Pending`. Nothing with
that status is ever served.

Change the Status cell to **Approved** and it appears on the site with the
badge **New**. Change it to **Under Contract** and it stays visible with that
badge. Anything else, including blank, hides it. No redeploy is needed
because the page reads the sheet live.

**Check:** reload ikag.capital/listings.html. The listing shows with its
photos. Then open the `/exec` URL in a private window and confirm the JSON
has no street address and none of the lister's name, email, phone, company
or role. Use the browser's find (Ctrl/Cmd+F) for the test address and email.

## 7. Turn off the pre-launch flag

`listings.html` has `var PRELAUNCH = true;` near the top of its page script.
While it is true, an unreachable feed shows the empty state, so a real outage
would look like an empty catalogue. Once steps 3 to 6 pass, set it to
`false`, commit and push to `main`.

## What the public endpoint will and will not return

`doGet` builds each listing from a fixed whitelist: `id, status, category,
propertyType, city, state, askingPrice, units, sqft, arv, rent, description,
listedOn, photos`. Sheet columns not on that list, such as the full address
and every lister contact field, are never read into the response. Anything
the page receives is public, whatever the page chooses to display.

Photos are served through Drive's thumbnail endpoint:

    https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600

Each file is set to anyone-with-link can view, which is what lets a visitor
load that URL. Anyone holding a photo URL can open that photo, so do not
approve images with documents, statements or anything sensitive in frame. If
the Workspace blocks link sharing, the photo is still saved and the alert says
so. Share it by hand or allow link sharing, otherwise it will not render on
the site.

## Photo payload sizes

Photos are resized in the browser to 1600px on the long edge and re-encoded
as JPEG, so a 17MB phone photo arrives at roughly 200 to 400KB. Ten photos
are normally 2 to 4MB. A worst-case image of pure visual noise measured 929KB
after resizing, so ten would be about 9MB, which Apps Script still accepts.
