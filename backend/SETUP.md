# Player data setup (Google Sheets)

Players' names, phone numbers, emails, scores and prizes are saved to a Google Sheet that you own.
Setup takes about 10 minutes and is done once.

## 1. Create the sheet and script

1. Create a new Google Sheet, for example **"Sneaky Cookie Players"**.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete everything in `Code.gs`, paste in the full contents of [`Code.gs`](Code.gs), and click **Save**.
4. In the toolbar, pick **`setup`** from the function dropdown and click **Run**.
   Google asks you to authorise the script: choose your account, then **Advanced → Go to (project name) → Allow**.
5. Back in the sheet you now have three tabs: **Players**, **Plays** and **Settings**.

## 2. Publish it as a web app

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
4. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

## 3. Connect the game

Open `game.js` and paste the URL into `PLAYER_API_URL` near the top:

```js
const PLAYER_API_URL = "https://script.google.com/macros/s/AKfycbwm6d3_SQ-e3_1pt_DFeyDHuo1KancwWuG0O8VPFm-1uZ9FkQMxr5QhMSmNFE_vYA1C/exec";
```

Commit and publish the site as usual. Players now have to sign up before playing, and every round is saved.

## Turning "one play per phone number" on or off

Open the **Settings** tab and tick or untick the **ONE_PLAY_ONLY** checkbox. The change applies to the next player straight away; you don't need to redeploy anything.

- **Ticked:** each phone number gets one round. Anyone who tries again sees a "You have played" popup with their final score.
- **Unticked:** unlimited rounds. Every round is still logged in **Plays**.

To give one player another try while it's ticked, set their **Plays** count in the **Players** tab back to `0`.

## What each tab holds

| Tab | One row per | Columns |
| --- | --- | --- |
| Players | phone number | Registered At, Name, Phone, Email, Plays, Best Score, Last Played At, Vouchers Won |
| Plays | round played | Play ID, Started At, Name, Phone, Cat, Score, Result, Prize, Finished At |
| Settings | setting | ONE_PLAY_ONLY checkbox |

To check a voucher claim, find the customer's phone number in **Players** and look at **Vouchers Won** (every voucher they've won, oldest first). The **Plays** tab shows which round each one came from.

## If you change Code.gs later

Go to **Deploy → Manage deployments**, edit the existing deployment, choose **Version: New version**, then **Deploy**. This keeps the same URL, so `game.js` doesn't need to change. If the update adds new columns, run `setup` once more to add their headers; your existing data is kept.
