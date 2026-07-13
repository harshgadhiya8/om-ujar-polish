#!/bin/bash
SCRIPT=$(find ~/Desktop ~/Documents ~ -maxdepth 5 -name "start-server.sh" 2>/dev/null | head -1)
if [ -z "$SCRIPT" ]; then
    echo "❌ Could not find start-server.sh. Make sure om-ujar-polish folder is downloaded."
    read -p "Press Enter to close..."
    exit 1
fi
bash "$SCRIPT"
