# Weighing Machine Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock `/api/weight` endpoint with a real serial port connection to the RS-232 weighing machine at `/dev/cu.usbserial-140`.

**Architecture:** A persistent `SerialPort` connection opens at server startup, parses `n/w:` lines from the stream, and stores the latest reading in a module-level variable. The `/api/weight` GET endpoint reads that variable. Auto-reconnect retries every 5 seconds on disconnect.

**Tech Stack:** Node.js, `serialport` v12, `@serialport/parser-readline` v12, Express

---

## File Map

| File | Change |
|---|---|
| `backend/package.json` | Add `serialport` and `@serialport/parser-readline` dependencies |
| `backend/server.js` | Add imports, serial port setup block, replace mock endpoint, update log + shutdown |

---

### Task 1: Install dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install the packages**

From the `backend/` directory:

```bash
cd /Users/harsh/personal-project/backend
npm install serialport @serialport/parser-readline
```

Expected output: lines ending with `added N packages` and no errors.

- [ ] **Step 2: Verify they appear in package.json**

```bash
grep -E "serialport" package.json
```

Expected:
```
"@serialport/parser-readline": "^12.x.x",
"serialport": "^12.x.x",
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "feat(scale): add serialport dependencies"
```

---

### Task 2: Add serial port setup to server.js

**Files:**
- Modify: `backend/server.js` (top-level imports and after DB connection block)

- [ ] **Step 1: Add imports at the top of server.js**

After the existing `const fs = require('fs');` line (line 8), add:

```js
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
```

- [ ] **Step 2: Add the serial port connection block**

After the entire database connection + migration block (after the closing `});` of the `db = new sqlite3.Database(...)` call, around line 30), add this block:

```js
// Serial port connection for weighing machine
let currentWeight = 0;
let scaleStatus = 'disconnected';
let reconnectTimer = null;

function connectScale() {
    if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
    }

    const port = new SerialPort({ path: '/dev/cu.usbserial-140', baudRate: 9600 });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.on('open', () => {
        console.log('⚖️  Scale connected on /dev/cu.usbserial-140');
        scaleStatus = 'ready';
    });

    parser.on('data', (line) => {
        const match = line.match(/n\/w:\s*([\d.]+)\s*g/i);
        if (match) {
            currentWeight = parseFloat(match[1]);
        }
    });

    function onDisconnect(err) {
        if (err) console.error('❌ Scale error:', err.message);
        scaleStatus = 'disconnected';
        if (!reconnectTimer) {
            console.log('🔄 Scale reconnect scheduled in 5s...');
            reconnectTimer = setInterval(connectScale, 5000);
        }
    }

    port.on('error', onDisconnect);
    port.on('close', () => {
        console.log('⚠️  Scale disconnected');
        onDisconnect(null);
    });

    return port;
}

let scalePort = connectScale();
```

- [ ] **Step 3: Start the server and verify no crash**

```bash
cd /Users/harsh/personal-project/backend
node server.js
```

Expected in console:
- `⚖️  Scale connected on /dev/cu.usbserial-140` (if cable is plugged in)
- OR `❌ Scale error: ...` followed by `🔄 Scale reconnect scheduled in 5s...` (if not connected)
- Server should NOT crash in either case

Stop with `Ctrl+C`.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(scale): add serial port connection with auto-reconnect"
```

---

### Task 3: Replace the mock /api/weight endpoint

**Files:**
- Modify: `backend/server.js:1049-1060`

- [ ] **Step 1: Replace the mock endpoint**

Find this block (around line 1049):

```js
// Mock weight endpoint (replace with real scale integration later)
app.get('/api/weight', (req, res) => {
    // Simulate random weight for testing (in grams, with 1 decimal place)
    const mockWeight = (Math.random() * 4900 + 100).toFixed(1);
    console.log(`⚖️  Mock weight reading: ${mockWeight}g`);

    res.json({
        weight: parseFloat(mockWeight),
        status: 'ready',
        timestamp: getCurrentTimestamp()
    });
});
```

Replace it with:

```js
// Weight endpoint - reads from live serial port connection
app.get('/api/weight', (req, res) => {
    res.json({
        weight: currentWeight,
        status: scaleStatus,
        timestamp: getCurrentTimestamp()
    });
});
```

- [ ] **Step 2: Update the startup log line**

Find (around line 2404):
```js
console.log(`   GET  /api/weight                 - Get current weight (mock)`);
```

Replace with:
```js
console.log(`   GET  /api/weight                 - Get current weight from scale`);
```

- [ ] **Step 3: Add serial port close to graceful shutdown**

Find the `process.on('SIGINT', ...)` block (around line 2410). Replace it with:

```js
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    if (reconnectTimer) clearInterval(reconnectTimer);
    if (scalePort && scalePort.isOpen) {
        scalePort.close(() => console.log('⚖️  Scale connection closed'));
    }
    db.close((err) => {
        if (err) {
            console.error('❌ Error closing database:', err.message);
        } else {
            console.log('✅ Database connection closed');
        }
        console.log('👋 Server stopped successfully');
        process.exit(0);
    });
});
```

- [ ] **Step 4: Verify the endpoint returns real data**

Start the server:
```bash
cd /Users/harsh/personal-project/backend
node server.js
```

In a second terminal:
```bash
curl http://localhost:3001/api/weight
```

Expected when scale is connected:
```json
{"weight":1.5,"status":"ready","timestamp":"2026-05-23 10:00:00"}
```

Expected when scale is not connected:
```json
{"weight":0,"status":"disconnected","timestamp":"2026-05-23 10:00:00"}
```

The `weight` value should change as you add/remove items from the scale. Confirm by placing something on the scale and hitting the endpoint again.

- [ ] **Step 5: Test disconnected state**

Unplug the USB adapter while the server is running. The server should log:
```
⚠️  Scale disconnected, will retry in 5s
🔄 Scale reconnect scheduled in 5s...
```

Re-plug the adapter. Within 5 seconds the server should log:
```
⚖️  Scale connected on /dev/cu.usbserial-140
```

Hit `/api/weight` again — it should return live readings.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js
git commit -m "feat(scale): replace mock weight endpoint with real serial port reading"
```
