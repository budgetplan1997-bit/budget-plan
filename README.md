# Budget Plan – Setup Guide

This app splits every income you enter into **Savings**, **Needs** and **Wants**, keeps every entry by date, takes **K10 from Savings and K5 from Wants on the 1st of every month**, syncs across your phone and computer, and **emails you a PDF summary every 1 January**.

It costs nothing to run. It uses three free services:

| Service | What it does |
|---|---|
| **GitHub Pages** | Hosts the app so you can open it from any phone or computer |
| **Firebase** (by Google) | Logins with user name + password, and the online database that syncs your records |
| **GitHub Actions** | A robot that runs on the 1st of each month: records deductions and sends the January email |

Set aside about **45 minutes**. Do the steps in order. A laptop is much easier than a phone for setup.

---

## Part A – Firebase (logins and online storage)

**Step 1. Create the project**
1. Go to **console.firebase.google.com** and sign in with **budgetplan1997@gmail.com**.
2. Click **Create a project**. Name it `budget-plan`. You can turn Google Analytics **off**. Click **Create**.

**Step 2. Turn on logins**
1. Left menu → **Build → Authentication** → **Get started**.
2. Choose **Email/Password** → switch **Enable** on (leave "Email link" off) → **Save**.

**Step 3. Create the database**
1. Left menu → **Build → Firestore Database** → **Create database**.
2. Location: pick **australia-southeast1 (Sydney)** – closest to PNG. *You cannot change this later.*
3. Choose **Start in production mode** → **Create**.
4. Open the **Rules** tab. Delete everything there, paste in the whole contents of the file `firestore.rules`, and click **Publish**.
   *This is what stops one user from seeing another user's money.*

**Step 4. Get your app keys**
1. Click the ⚙️ gear (top left) → **Project settings**.
2. Under **Your apps**, click the **</>** (web) icon. Nickname: `budget-plan`. Do **not** tick Firebase Hosting. Click **Register app**.
3. You will see a block called `firebaseConfig`. Copy the six values (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
4. Open `index.html`, find `PASTE_YOUR_API_KEY` near the bottom, and replace each `PASTE…` value with yours. Keep the quote marks.

> These keys are **safe to be public**. Your data is protected by the rules from Step 3 and by each user's password.

---

## Part B – GitHub (put the app online)

**Step 5. Create the repository**
1. On github.com click **+ → New repository**. Name: `budget-plan`. Choose **Public** (free GitHub Pages needs public). Click **Create repository**.
2. Click **uploading an existing file**. Drag in **all** files and folders, including the `.github` folder and the `scripts` folder. Click **Commit changes**.
   *Beginner tip: the `.github` folder is hidden on some computers. If it does not upload, click **Add file → Create new file**, type the name `.github/workflows/monthly-job.yml`, and paste that file's contents in.*

**Step 6. Turn on the website**
1. In the repo: **Settings → Pages**.
2. Source: **Deploy from a branch**. Branch: **main**, folder **/ (root)** → **Save**.
3. Wait 1–2 minutes. Your app address will be: `https://YOUR-GITHUB-NAME.github.io/budget-plan/`

**Step 7. Allow logins from that address**
1. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain**.
2. Add `YOUR-GITHUB-NAME.github.io` (no `https://`, no `/budget-plan`).

---

## Part C – The year-end email robot

**Step 8. Make a Gmail "App password"** (so the robot can send email)
1. Sign in to **myaccount.google.com** as **budgetplan1997@gmail.com**.
2. **Security → 2-Step Verification** → turn it **on** (required).
3. Search the settings bar for **App passwords**. Create one called `Budget Plan`.
4. Copy the 16-letter password. *You only see it once.*

**Step 9. Get the Firebase robot key**
1. Firebase → ⚙️ **Project settings → Service accounts** → **Generate new private key** → **Generate key**.
2. A `.json` file downloads. **Never upload this file to GitHub.** It is a master key to your data.

**Step 10. Give the secrets to GitHub**
In your repo: **Settings → Secrets and variables → Actions → New repository secret**. Add these three:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Open the `.json` file in Notepad, copy **everything**, paste |
| `GMAIL_USER` | `budgetplan1997@gmail.com` |
| `GMAIL_APP_PASSWORD` | The 16 letters from Step 8 (no spaces) |

Then delete the `.json` file from your Downloads.

---

## Part D – Start using it

**Step 11. Create your account**
1. Open your app address on your phone.
2. Tap **New user? Create an account**. Pick a user name and password, and enter **rbwartovo@gmail.com** as your report email.
3. In your phone browser menu, tap **Add to Home screen** so it opens like a normal app.

**Step 12. Test the email now (don't wait until January)**
1. Add one or two test incomes in the app.
2. GitHub repo → **Actions** tab → **Monthly budget job** → **Run workflow**.
   Leave mode = `report`, type year `2026`, type your user name → **Run workflow**.
3. In 1–2 minutes check rbwartovo@gmail.com (also check Spam). Green tick = working. Red ✗ = click it to read the error.
4. Delete the test entries in the app (History → Edit → Delete).

---

## How it works (day to day)

- **Add income:** Home tab → amount fills with your usual K250 → **Save income**. Or type hours worked and tap **= Amount** (hours × K5).
- **Change your income:** Settings → *Usual income*. To fix one past entry: History → **Edit**.
- **Split:** 33.34% / 33.33% / 33.33% by default (even split). Change it in Settings. Changes only affect new entries.
- **Monthly deductions:** K10 from Savings + K5 from Wants on the 1st of each month. They are recorded once only, even with several phones.
- **No internet?** Keep entering. It saves on the phone and syncs when you are back online.
- **Other people:** each person taps *Create an account* with their own user name. Nobody can see anyone else's records.
- **PDF any time:** Settings → Reports → **Download PDF report**.
- **Year-end email:** sent automatically on **1 January at about 10 am PNG time** for the year just ended. GitHub can run this a little late (sometimes up to an hour).

## Common mistakes to avoid

1. **Forgetting Step 7** → login shows an "unauthorized domain" error.
2. **Uploading the `.json` key file to GitHub** → anyone could read or wipe your data. If it happens, delete that key in Firebase → Service accounts and make a new one.
3. **Forgetting your password** → there is no "forgot password" email (user names are not email addresses). Write it down somewhere safe. If lost, you can delete the user in Firebase → Authentication and sign up again, but their old records will not be linked.
4. **Making the repo private** on a free GitHub account → the website stops working.
5. **Editing `LOGIN_DOMAIN` in `index.html` after people sign up** → nobody can log in.
