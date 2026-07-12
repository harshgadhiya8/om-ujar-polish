# Om Ujar Polish — Silver Ornament Management System

A shop management system for silver ornament polishing — job tracking, receipts, ledgers, and a phone barcode scanner.

---

## Setting Up on a New Mac

### Step 1 — Install Git

Open **Terminal** (Cmd + Space → type Terminal → Enter) and run:

```bash
xcode-select --install
```

A dialog will appear — click **Install**. Wait for it to finish (5–10 minutes).

### Step 2 — Download the code from GitHub

```bash
cd ~/Desktop
git clone https://github.com/harshgadhiya8/om-ujar-polish.git
cd om-ujar-polish
```

This creates a folder called `om-ujar-polish` on your Desktop.

### Step 3 — Run the setup script

```bash
bash setup.sh
```

This automatically installs everything needed (Homebrew, Node.js, mkcert, certificates, dependencies) and builds the app. Your Mac password will be asked once — this is normal.

At the end, it prints your URLs:

```
App URL (laptop):    https://Your-Mac-Name.local:3001
Scanner URL (phone): https://Your-Mac-Name.local:3001/scan.html
```

Write these down.

### Step 4 — Set up iPhone (once per iPhone)

See **Section 2** of `RUNBOOK.pdf` in the project folder for the iPhone certificate installation steps.

### Step 5 — Start the app

Double-click **Polish System.app** in the project folder.

---

## Updating to the Latest Code

When the developer pushes new changes, pull them and rebuild:

```bash
cd ~/Desktop/om-ujar-polish
git pull
cd frontend && npm install && npm run build && cd ..
cd backend && npm install && cd ..
```

Then restart **Polish System.app**.

---

## Repository Structure

```
om-ujar-polish/
├── backend/            # Node.js / Express server
│   ├── server.js       # Main backend file
│   ├── archives/       # Monthly Excel archive exports
│   └── public/         # Phone scanner page (scan.html)
├── frontend/           # React app
│   └── src/
│       └── components/ # InitialBill, CompleteJob, Ledgers, Archive
├── setup.sh            # One-command setup for a new Mac
├── start-server.sh     # Script used by Polish System.app
├── Polish System.app/  # Double-click launcher
├── RUNBOOK.pdf         # Operations guide (daily use, troubleshooting)
└── RUNBOOK.md          # Same guide in text format
```

---

## For the Developer

### Making and pushing changes

```bash
# Pull latest before starting work
git pull

# ... make your changes ...

# Rebuild frontend if you changed frontend code
cd frontend && npm run build && cd ..

# Stage, commit, push
git add <files>
git commit -m "description of change"
git push
```

### Key files

| File | What it does |
|---|---|
| `backend/server.js` | All API endpoints, printer, scale, database |
| `frontend/src/components/InitialBill.js` | Create job form |
| `frontend/src/components/CompleteJob.js` | Complete job + barcode scanner |
| `frontend/src/components/DailyLedger.js` | Daily ledger view |
| `frontend/src/components/CustomerLedger.js` | Per-customer ledger |
| `frontend/src/components/Archive.js` | Monthly archive export |

### Database

SQLite database is stored at `om-ujar-palish` (no extension) in the parent folder of the repo. It is intentionally excluded from git — it stays on the machine.

### Environment

- Backend runs on port **3001** over HTTPS
- Frontend is built to `frontend/build/` and served statically by the backend
- Certificates are generated per-machine by `setup.sh` and stored in `backend/certs/` (excluded from git)
