# Listings backend: deploy notes

Everything here is done from the **contact@ikag.capital** Google account. The
script sends mail as whichever account owns it, so signing in as anyone else
means redoing it.

## 1. Paste the script

1. Open the **IKAG Submissions** spreadsheet.
2. **Extensions → Apps Script**.
3. Select everything in the editor and paste in the contents of `Code.gs`
   from this folder. It is a complete replacement: the referral and deal
   handlers are already in it, so nothing that works today stops working.
4. Save.

## 2. Create the sheets and the Drive folder

Run `setup` once from the editor (function dropdown → `setup` → Run).

It creates any missing tabs and the Drive folder, so there is nothing to
make by hand:

| Tab | What goes in it |
| --- | --- |
| All Submissions | every POST, logged before anything else runs |
| Unsecured Referrals | existing |
| Deal Submissions | existing |
| **IKAG Listings** | listing ID, timestamp, status, lister, property, photo file IDs |
| **Listing Inquiries** | timestamp, listing ID, inquirer |
| Errors | anything that threw |

It also creates the Drive folder **IKAG Listing Photos**. Each listing gets
its own subfolder named after its listing ID.

Google will ask for permission the first time, including Drive access this
time. Click **Advanced → Go to IKAG Submissions (unsafe)**. It is your own
script.

Check the execution log afterwards: it prints which account the script runs
as, the remaining mail quota, and the URL of the photo folder.

## 3. Deploy

**Deploy → New deployment → gear → Web app**

- Execute as: **Me**
- Who has access: **Anyone**

That second setting is the one that matters. A Workspace account also offers
*Anyone within ikag.capital*, which looks right and is not: it forces a
Google sign-in, and a visitor who is not signed in silently gets a login page
instead of the endpoint. The listings page would show its error state and no
form submission would ever arrive.

Copy the Web app URL. If it looks like

    https://script.google.com/a/macros/ikag.capital/s/AKfy.../exec

delete the `/a/macros/ikag.capital` part so it reads

    https://script.google.com/macros/s/AKfy.../exec

Same deployment, public form of the URL.

## 4. Redeploying later without changing the URL

Editing the script does **not** change what is live. To publish a change:

**Deploy → Manage deployments → pencil icon → Version: New version → Deploy**

The URL stays the same, so nothing in the site needs touching.

Creating a *new deployment* instead gives you a *new URL* and leaves the old
code serving the site. That is the usual reason a change appears to do
nothing.

## 5. Where the URL goes in the site

The web app URL appears once in each of these files, as the `ENDPOINT`
constant near the top of the page script:

- `listings.html` — reads listings with GET, posts inquiries
- `list-property.html` — posts new listings

and as the `action` attribute of the existing forms in:

- `apply.html`
- `contact.html`

To change it everywhere at once:

```bash
grep -rl 'script.google.com/macros/s/' *.html \
  | xargs sed -i 's#https://script.google.com/macros/s/[^"]*/exec#NEW_URL_HERE#g'
```

## 6. Check it before trusting it

Open the `/exec` URL in a **private window**. You should see JSON:

```json
{"ok":true,"listings":[]}
```

A Google sign-in page instead means step 3 is wrong.

Then `https://ikag.capital/listings.html?mock=1` renders the page against
`listings.mock.json` instead of the backend, so the layout can be checked
before any real listing exists. Drop the `?mock=1` to go live.

## 7. Approving a listing

A submission lands in **IKAG Listings** with status `Pending`. Nothing with
that status is ever served to the public page.

Change the Status cell to **Approved** and it appears on the site. Change it
to **Under Contract** and it stays visible with that badge. Anything else,
including blank, keeps it hidden.

No redeploy is needed. The page reads the sheet live.

## What the public endpoint will and will not return

`doGet` builds its response from a fixed whitelist of fields. The full street
address, the lister's name, email, phone, company, and role are never written
into it, because anything the page receives is public no matter what the page
chooses to display.

Photos are served through Drive's thumbnail endpoint:

    https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600

Each uploaded file is set to anyone-with-link can view, which is what makes
that URL load for a visitor. Anyone holding a photo URL can open that photo.
Do not upload images with documents, statements, or anything else sensitive
in frame.

## Photo payload sizes

Photos are resized in the browser to 1600px on the long edge and re-encoded
as JPEG before upload, so a 17MB phone photo arrives at roughly 200 to 400KB.
Ten photos is normally 2 to 4MB. A worst case image of pure visual noise
measured 929KB after resizing, so ten of those would be about 9MB, which is
still within what Apps Script accepts.
