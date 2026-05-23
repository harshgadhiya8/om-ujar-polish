# Weighing Machine Integration Design

**Date:** 2026-05-23
**Status:** Approved

## Overview

Replace the mock `/api/weight` endpoint in the Express backend with a real serial port connection to the RS-232 weighing machine connected via USB adapter at `/dev/cu.usbserial-140`.

## Architecture

The backend opens one persistent `SerialPort` connection at server startup. A `ReadlineParser` splits the incoming stream on newlines. Whenever a line containing `n/w:` arrives, the latest weight value is parsed and stored in a module-level `currentWeight` variable. The existing `/api/weight` GET endpoint reads from that variable instead of returning a random mock value.

No frontend changes are required. Both `InitialBill.js` and `CompleteJob.js` already poll `/api/weight` every 2 seconds and display the live weight. Users press "Capture" to lock in a reading — the continuous stream only ever updates the live display, nothing is auto-saved.

## Components

| Component | Location | Change |
|---|---|---|
| `serialport` and `@serialport/parser-readline` | `backend/package.json` | Add 2 dependencies |
| Serial connection + parser setup | `backend/server.js` (top-level, after DB init) | ~30 new lines |
| `/api/weight` endpoint | `backend/server.js:1049` | Replace mock with real read |

## Data Flow

```
Scale → RS-232 → USB adapter → /dev/cu.usbserial-140
  → serialport (Node.js) → ReadlineParser
  → parse "n/w:  1.5 g" → currentWeight = 1.5
  → GET /api/weight → { weight: 1.5, status: "ready" }
  → React poll (2s) → display live weight
  → user clicks Capture → value locked in captures array
```

## Serial Port Configuration

- Port: `/dev/cu.usbserial-140`
- Baud rate: `9600`
- Parser: `ReadlineParser` (split on `\n`)
- Line format to parse: `n/w:` followed by a number and `g` (e.g., `n/w:       1.5 g`)

## Error Handling

- **Port fails to open** (cable unplugged, wrong path): `currentWeight` stays `0`, `/api/weight` returns `{ weight: 0, status: "disconnected" }`. Frontend already renders 0g gracefully.
- **Port disconnects mid-session**: Log the error, attempt reconnect every 5 seconds using `setInterval`. On reconnect success, clear the interval.
- **Malformed line**: Skip silently — only update `currentWeight` when regex matches a valid number.

## Dependencies

```
serialport
@serialport/parser-readline
```

Both are the official `serialport` v12 packages, maintained by the Node.js Serial Port project.

## Out of Scope

- WebSocket / push-based updates (existing 2s poll is sufficient)
- Configurable port path or baud rate (hardcoded is fine for this single-machine setup)
- Frontend changes
