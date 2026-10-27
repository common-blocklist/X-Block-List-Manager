# X Block List Manager
 
A Firefox extension that mass-blocks (and mass-unblocks) X.com accounts from a pasted or uploaded list of handles, and keeps a local log of exactly who you blocked.
 
## Features
 
- **Paste or upload a list**: paste handles into a text box or load a `.csv`, `.tsv` or `.txt` file.
- **Flexible input parsing**: accepts `@handle`, bare `handle`, and profile URLs (`https://x.com/handle`, `https://twitter.com/handle`). Handles can be separated by lines, commas, semicolons, tabs or spaces. Duplicates are removed automatically.
- **CSV aware**: if the first row has a column named `handle`, `username`, `screen_name` or `user`, that column is used. Otherwise the first column is used.
- **Mass block**: blocks every account on the list, one after another, with progress shown live.
- **Mass unblock**: unblock from a pasted list, from selected rows in the history, or everyone this tool blocked with one click.
- **Block history**: a searchable, filterable table of every account processed, with status, timestamp and error notes. Export it to CSV at any time.
- **Rate-limit handling**: randomized delays between actions, and automatic pause and resume when X returns a rate-limit response.
- **Safe stops**: stops on account-lock or automation warnings, and you can stop manually at any time.
## Installation
 
### Temporary install (quickest)
 
1. Download or clone this repository and unzip it if needed.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**
4. Select the `manifest.json` file from the extension folder.
Temporary add-ons are removed when Firefox restarts.
 
### Permanent install
 
Firefox requires extensions to be signed. Either:
 
- Submit the extension to [addons.mozilla.org](https://addons.mozilla.org/developers/) using the free **unlisted** option to get a signed `.xpi`, or
- Use Firefox Developer Edition or Nightly and set `xpinstall.signatures.required` to `false` in `about:config`.
## Usage
 
1. Open [x.com](https://x.com) in Firefox and log in.
2. Click the **X Block List Manager** toolbar button to open the dashboard.
3. Check that the banner at the top says it is connected to your logged-in x.com tab. If it can't reach the tab, reload your x.com tab once.
4. Paste your list into the text box, or choose a file. The number of detected handles is shown below the box.
5. Optionally adjust the **delay between actions** (default 2 seconds).
6. Click **Block these accounts** and confirm.
7. Keep the dashboard tab and an x.com tab open until the run finishes.
### Reviewing and undoing
 
The **History** section lists every account processed.
 
- Filter by status: currently blocked, unblocked, not found or suspended, failed.
- Search by handle. Each handle links to its profile.
- Select rows and click **Unblock selected**, or click **Unblock everyone I blocked** to undo all blocks made through this tool.
- Click **Export CSV** to save the full history.
- **Clear history** deletes the local log only. It does not unblock anyone on X.
### Example input
 
```text
@example1
example2
https://x.com/example3
```
 
or a CSV:
 
```csv
handle,reason
example1,spam
example2,bots
```
 
## How it works
 
The extension has three parts:
 
| File | Role |
| --- | --- |
| `dashboard.html` / `dashboard.js` / `dashboard.css` | The user interface: parsing, queue runner, history table, import/export. |
| `content.js` | Injected into x.com tabs. Sends the block/unblock requests from inside the page. |
| `background.js` | Opens the dashboard when the toolbar button is clicked. |
 
Flow:
 
1. The dashboard parses and de-duplicates the handles.
2. For each handle, it sends a message to a content script running in your open x.com tab.
3. The content script calls X's web API (`/i/api/1.1/blocks/create.json` or `blocks/destroy.json`) as your logged-in session, using the page's own `ct0` CSRF cookie. No passwords or API keys are involved and nothing is sent to third parties.
4. The result (success, user not found, rate limited, error) is returned to the dashboard, which records it in `browser.storage.local` and updates the table.
5. On a rate limit (HTTP 429), the queue waits until X's reset time and retries. On fatal errors (logged out, account locked, automation detected), it stops.
All data (the history log and your delay setting) is stored locally in your browser.
 
### Permissions
 
- `storage`: save the history and settings locally.
- `tabs`: find your open x.com tab and the dashboard tab.
- `https://x.com/*`, `https://twitter.com/*`: run the content script and make requests as your session.
## Limitations and disclaimer
 
- The extension uses X's **undocumented internal web API**, which X may change or restrict at any time.
- Automated actions may violate X's Terms of Service, and heavy automation can trigger rate limits, temporary locks or other enforcement. Use it on your own account, at your own risk, and keep delays reasonable for large lists.
- Large lists can take hours because of rate limits. The dashboard tab and an x.com tab must stay open while it runs.
- The history only includes accounts processed by this tool, not blocks you made before.
- Blocking is not a security or privacy guarantee. Double-check lists from third parties before applying them, as a bad list will block real accounts.
This project is not affiliated with or endorsed by X Corp.
