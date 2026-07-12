#!/bin/bash

# Kill anything already running on port 3001
lsof -ti tcp:3001 | xargs kill -9 2>/dev/null

# Start the backend (logs go to a file for debugging)
cd "$(dirname "$0")/backend"
/opt/homebrew/bin/node server.js > /tmp/polish-server.log 2>&1 &

# Wait for server to be ready
for i in $(seq 1 15); do
    sleep 1
    if curl -sk https://localhost:3001 > /dev/null 2>&1; then
        break
    fi
done

# Open in default browser
open https://localhost:3001
