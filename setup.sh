#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "======================================"
echo "  Om Ujar Polish System - Setup"
echo "======================================"
echo ""

# ── 1. Homebrew ────────────────────────────────────────────────
# Determine brew binary location (Apple Silicon: /opt/homebrew, Intel: /usr/local)
if [ -f /opt/homebrew/bin/brew ]; then
    BREW=/opt/homebrew/bin/brew
    BREW_BIN=/opt/homebrew/bin
elif [ -f /usr/local/bin/brew ]; then
    BREW=/usr/local/bin/brew
    BREW_BIN=/usr/local/bin
else
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Set path after fresh install
    if [ -f /opt/homebrew/bin/brew ]; then
        BREW=/opt/homebrew/bin/brew
        BREW_BIN=/opt/homebrew/bin
    else
        BREW=/usr/local/bin/brew
        BREW_BIN=/usr/local/bin
    fi
fi

eval "$($BREW shellenv)"
echo "✅ Homebrew ready ($BREW)"

# ── 2. Node.js ─────────────────────────────────────────────────
if [ ! -f "$BREW_BIN/node" ] && ! command -v node &>/dev/null; then
    echo "Installing Node.js..."
    $BREW install node
else
    echo "✅ Node.js $(node -v 2>/dev/null || echo 'found') already installed"
fi

# ── 3. mkcert ──────────────────────────────────────────────────
if [ ! -f "$BREW_BIN/mkcert" ]; then
    echo "Installing mkcert..."
    $BREW install mkcert
fi

# Use absolute path to mkcert — avoids PATH issues entirely
MKCERT="$BREW_BIN/mkcert"
if [ ! -f "$MKCERT" ]; then
    echo "❌ mkcert not found at $MKCERT after install."
    echo "   Try running manually: $BREW install mkcert"
    exit 1
fi
echo "✅ mkcert ready ($MKCERT)"

# ── 4. Install root CA and generate certificate ────────────────
echo ""
echo "Installing certificate authority (your Mac password may be asked)..."
$MKCERT -install

HOSTNAME=$(scutil --get LocalHostName)
LOCAL_HOST="${HOSTNAME}.local"
CERT_DIR="$ROOT_DIR/backend/certs"
mkdir -p "$CERT_DIR"

echo ""
echo "Generating HTTPS certificate for: $LOCAL_HOST"
$MKCERT -key-file "$CERT_DIR/local-key.pem" -cert-file "$CERT_DIR/local.pem" \
    "$LOCAL_HOST" localhost 127.0.0.1

echo "$LOCAL_HOST" > "$CERT_DIR/hostname.txt"
echo "✅ Certificate saved to backend/certs/"

# ── 5. npm install ─────────────────────────────────────────────
echo ""
echo "Installing backend dependencies..."
cd "$ROOT_DIR/backend"
npm install

echo ""
echo "Installing frontend dependencies and building..."
cd "$ROOT_DIR/frontend"
npm install
npm run build

# ── Done ───────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  Setup Complete!"
echo "======================================"
echo ""
echo "  App URL (laptop):    https://${LOCAL_HOST}:3001"
echo "  Scanner URL (phone): https://${LOCAL_HOST}:3001/scan.html"
echo ""
echo "  Next step: Install the certificate on your iPhone."
echo "  See RUNBOOK.pdf → 'iPhone Certificate Setup' section."
echo ""
