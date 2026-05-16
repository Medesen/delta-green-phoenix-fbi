# Cloudflare Deployment Guide

## 1. Create a Cloudflare account
Go to https://dash.cloudflare.com and sign up (free).

## 2. Deploy the Worker

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Worker**
2. Name it something like `dg-investigation`
3. Click **Deploy**, then **Edit code**
4. Paste the contents of `worker.js` and click **Deploy**

### Add environment variables (secrets)
In your Worker → **Settings → Variables and Secrets**, add:

| Variable name    | Value                                      |
|------------------|--------------------------------------------|
| `GITHUB_TOKEN`   | A GitHub PAT with `repo` / `contents` write scope |
| `GITHUB_OWNER`   | `Medesen`                                  |
| `GITHUB_REPO`    | `delta-green-phoenix-fbi`                  |
| `GITHUB_BRANCH`  | `main`                                     |
| `GM_PASSPHRASE`  | A secret passphrase of your choice         |

**Add each as a Secret** (not a plain text variable) so they are encrypted.

### Note the Worker URL
It will be something like `https://dg-investigation.YOUR-SUBDOMAIN.workers.dev`.
Copy this URL and paste it into `investigation/app.js` as `WORKER_URL`.

## 3. Deploy the investigation app to Cloudflare Pages

1. In the dashboard, go to **Workers & Pages → Create → Pages**
2. Connect your GitHub account and select the `delta-green-phoenix-fbi` repo
3. Set:
   - **Project name**: `dg-investigation` (or whatever you like)
   - **Root directory**: `investigation`
   - **Build command**: *(leave empty)*
   - **Build output directory**: *(leave empty / use `.`)*
4. Click **Save and Deploy**

Your app will be live at `https://dg-investigation.pages.dev` (or similar).

## 4. Set up Cloudflare Access (email protection)

1. Go to **Zero Trust → Access → Applications → Add an application**
2. Choose **Self-hosted**
3. Set the **Application domain** to your Pages URL (e.g. `dg-investigation.pages.dev`)
4. Under **Policies**, create a policy:
   - **Action**: Allow
   - **Rule**: Emails — add each player's email address
5. Save. Players will now be prompted for a one-time email code when they visit.

## 5. Update app.js

Open `investigation/app.js` and replace:
```js
var WORKER_URL = 'https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev';
```
with your actual Worker URL from step 2.

Commit and push — Cloudflare Pages will auto-redeploy.

## 6. GM access

To access GM mode, visit:
```
https://dg-investigation.pages.dev/?gm=true
```
You will be prompted for the `GM_PASSPHRASE` you set in step 2.
