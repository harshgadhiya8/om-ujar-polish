# Om Ujar Polish System — Runbook

A complete guide covering first-time setup, daily usage, and the phone scanner.

---

## Table of Contents

1. [First-Time Setup (New Mac)](#1-first-time-setup-new-mac)
2. [iPhone Certificate Setup](#2-iphone-certificate-setup)
3. [Starting the App Every Day](#3-starting-the-app-every-day)
4. [Using the App](#4-using-the-app)
5. [Phone Scanner](#5-phone-scanner)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. First-Time Setup (New Mac)

Do this **once** when setting up on a new computer. You need internet for this step.

### Step 1 — Copy the project folder

Copy the entire project folder (the one containing `setup.sh`) to the new Mac.

### Step 2 — Run the setup script

Open **Terminal** (press `Cmd + Space`, type `Terminal`, press Enter).

Type the following and press Enter:

```
cd /path/to/project-folder
bash setup.sh
```

Replace `/path/to/project-folder` with the actual location of the folder (you can drag the folder into Terminal to get the path).

The script will automatically:
- Install Homebrew (Mac package manager)
- Install Node.js
- Install mkcert (certificate tool)
- Generate an HTTPS certificate for this Mac
- Install all app dependencies
- Build the app

> Your Mac password may be asked once during certificate installation — this is normal.

### Step 3 — Note your URLs

At the end of setup, the script will print two URLs like this:

```
App URL (laptop):    https://Your-Mac-Name.local:3001
Scanner URL (phone): https://Your-Mac-Name.local:3001/scan.html
```

Write these down — you will use them every day.

### Step 4 — Create the app launcher

Double-click the file called **`Polish System.app`** in the project folder.
If macOS asks "Are you sure you want to open it?", click **Open**.

From now on, just double-click this app to start the system.

---

## 2. iPhone Certificate Setup

Do this **once per iPhone**. This allows the phone to trust the app's HTTPS connection.

### Step 1 — Find the CA certificate file

On the Mac, open Terminal and run:

```
open "$(mkcert -CAROOT)"
```

A folder opens containing a file called **`rootCA.pem`**.

### Step 2 — Send the file to iPhone

**AirDrop** the `rootCA.pem` file to the iPhone:
1. Right-click `rootCA.pem` → Share → AirDrop
2. Select the iPhone
3. On the iPhone, tap **Allow**

### Step 3 — Install the profile on iPhone

1. Open **Settings** on iPhone
2. At the top, tap **Profile Downloaded** (appears after AirDrop)
3. Tap **Install** (top right)
4. Enter your iPhone passcode if asked
5. Tap **Install** again → **Done**

### Step 4 — Enable full trust

1. Go to **Settings → General → About**
2. Scroll to the bottom → tap **Certificate Trust Settings**
3. Find **mkcert** in the list
4. Toggle it **ON** (it will turn green)
5. Tap **Continue** on the warning

Done. You only need to do this once — even if you change WiFi networks.

---

## 3. Starting the App Every Day

1. Make sure the Mac and iPhone are connected to the **same WiFi network**
2. Double-click **`Polish System.app`**
3. Wait about 5 seconds — the browser opens automatically at the app

> If the browser shows a certificate warning on the laptop: click **Advanced → Proceed to site**. This only happens the first time on a new browser.

---

## 4. Using the App

### Creating a New Job (Incoming Ornament)

1. Go to **Create Initial Bill**
2. Select the customer from the dropdown (or create a new one)
3. Select the **Ornament Type** from the dropdown
   - Type to search — e.g. type "pa" to find "Payal"
   - If the ornament type is not in the list, select **+ Other** and type the name — it gets saved for next time
4. Place the ornament on the scale — the weight appears automatically
5. Press **Capture Weight** (repeat if multiple pieces)
6. Review the Bill Summary and click **Create Bill**
7. The receipt prints and a PDF is generated

### Completing a Job (Outgoing Ornament)

1. Go to **Complete Job**
2. Scan the barcode on the receipt **or** type the job number manually
3. Enter the outgoing weights (Javak Vajan captures)
4. Enter Bag Vajan (weight of the bag)
5. Enter Ghat if applicable (additional loss charge)
6. Review the Fine calculation and click **Complete Job**
7. The completion receipt prints

### Customer Ledger

- Select a customer and month to view all their jobs
- Toggle between **Summary** (totals) and **Detailed** (per job) view
- Download as **CSV** or **PDF**

### Daily Ledger

- Select a date range to view all completed jobs
- Toggle columns on/off as needed
- Download as **CSV** or **PDF**

### Monthly Archive

- Select the month (usually last month on the 5th–6th of new month)
- Click **Load Preview** to review what will be archived
- Click **Download Archive** — saves an Excel file per customer

---

## 5. Phone Scanner

Used to scan the barcode on a receipt to auto-fill the job number on the laptop.

### Before scanning:

1. Make sure phone and laptop are on the **same WiFi**
2. On the laptop, open the **Complete Job** page (the scanner only works when this page is open)

### On the iPhone:

1. Open Safari and go to:
   ```
   https://Your-Mac-Name.local:3001/scan.html
   ```
   > Replace `Your-Mac-Name` with the name printed during setup. Bookmark this URL — you won't need to type it again.

2. Tap **Allow** when Safari asks for camera access
3. Point the camera at the barcode on the receipt
4. The job number fills in automatically on the laptop

### WiFi rule:
Both the phone and laptop must be on the **same WiFi** for the scanner to work. If scanning stops working, check that both are on the same network.

---

## 6. Troubleshooting

### App doesn't open / Polish System.app does nothing
- Open Terminal and run: `cat /tmp/polish-server.log`
- Look for any error at the bottom and share it with your developer

### Browser shows "Your connection is not private"
- On the laptop: click **Advanced → Proceed to localhost (unsafe)**
- This is normal for the first time on a new browser

### Phone shows certificate error on scanner page
- Check that you completed all steps in [Section 2](#2-iphone-certificate-setup)
- Make sure the **Certificate Trust** toggle is ON (Settings → General → About → Certificate Trust Settings)

### Scanner scans but nothing happens on laptop
- Make sure the **Complete Job** page is open on the laptop — the scanner only sends to that page
- Check both devices are on the same WiFi

### Scale weight not showing
- Make sure the scale is plugged in via USB before starting the app
- Restart the app (close Polish System.app, wait 5 seconds, open again)

### "Setup script" errors on a new Mac
If `bash setup.sh` shows an error:
1. Make sure you have internet connection
2. Try running `xcode-select --install` in Terminal first, then run setup again
