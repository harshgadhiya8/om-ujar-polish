#!/bin/bash

# Kill anything already running on port 3001
lsof -ti tcp:3001 | xargs kill -9 2>/dev/null

# Find node — works on Apple Silicon (/opt/homebrew) and Intel (/usr/local)
if [ -f /opt/homebrew/bin/node ]; then
    NODE=/opt/homebrew/bin/node
elif [ -f /usr/local/bin/node ]; then
    NODE=/usr/local/bin/node
else
    NODE=$(which node 2>/dev/null || echo "")
fi

if [ -z "$NODE" ]; then
    echo "❌ node not found. Please run setup.sh first." > /tmp/polish-server.log
    exit 1
fi

# Start the backend (logs go to a file for debugging)
cd "$(dirname "$0")/backend"
"$NODE" server.js > /tmp/polish-server.log 2>&1 &

# Wait for server to be ready
for i in $(seq 1 15); do
    sleep 1
    if curl -sk https://localhost:3001 > /dev/null 2>&1; then
        break
    fi
done

# Open in default browser
open https://localhost:3001
