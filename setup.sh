#!/bin/bash
set -e

echo ""
echo "======================================"
echo "  Om Ujar Polish System - Setup"
echo "======================================"
echo ""

# ── 1. Homebrew ────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "✅ Homebrew already installed"
fi

# ── 2. Node.js ─────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "Installing Node.js..."
    brew install node
else
    echo "✅ Node.js $(node -v) already installed"
fi

# ── 3. mkcert ──────────────────────────────────────────────────
if ! command -v mkcert &>/dev/null; then
    echo "Installing mkcert..."
    brew install mkcert
else
    echo "✅ mkcert already installed"
fi

# Install mkcert root CA into Mac's trust store
echo ""
echo "Installing certificate authority (you may be asked for your Mac password)..."
mkcert -install

# ── 4. Generate certificate for this Mac ───────────────────────
HOSTNAME=$(scutil --get LocalHostName)
LOCAL_HOST="${HOSTNAME}.local"
CERT_DIR="$(dirname "$0")/backend/certs"
mkdir -p "$CERT_DIR"

echo ""
echo "Generating HTTPS certificate for: $LOCAL_HOST"
mkcert -key-file "$CERT_DIR/local-key.pem" -cert-file "$CERT_DIR/local.pem" \
    "$LOCAL_HOST" localhost 127.0.0.1

# Save hostname so the runbook can reference it
echo "$LOCAL_HOST" > "$CERT_DIR/hostname.txt"

echo "✅ Certificate saved to backend/certs/"

# ── 5. npm install ─────────────────────────────────────────────
echo ""
echo "Installing backend dependencies..."
cd "$(dirname "$0")/backend"
npm install

echo ""
echo "Installing frontend dependencies and building..."
cd "$(dirname "$0")/frontend"
npm install
npm run build

# ── Done ───────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  Setup Complete!"
echo "======================================"
echo ""
echo "  App URL (laptop):  https://${LOCAL_HOST}:3001"
echo "  Scanner URL (phone): https://${LOCAL_HOST}:3001/scan.html"
echo ""
echo "  Next step: Install the certificate on your iPhone."
echo "  See RUNBOOK.md → 'iPhone Certificate Setup' section."
echo ""
