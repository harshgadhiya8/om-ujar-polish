# Thermal Printer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically print a physical receipt on the Scale+ thermal printer when a job is created or completed, with a warning banner + Reprint button if printing fails.

**Architecture:** A `printReceipt(jobData, type)` function writes ESC/POS bytes to the open `scalePort` serial connection. It is called inside the existing job create and complete endpoints after the DB write, and its result (success or error message) is returned alongside the job data. The frontend reads `printError` from the response and shows a warning banner + Reprint button when set.

**Tech Stack:** Node.js, serialport (already installed), ESC/POS binary protocol, React

---

## File Map

| File | Change |
|---|---|
| `backend/server.js` | Add `printReceipt()`, wire into job create + complete, add reprint endpoint |
| `frontend/src/components/InitialBill.js` | Read `printError`, show warning banner + Reprint button |
| `frontend/src/components/InitialBill.css` | Add `.message.warning` style |
| `frontend/src/components/CompleteJob.js` | Read `printError`, show warning banner + Reprint button |

---

### Task 1: Add `printReceipt()` function to server.js

**Files:**
- Modify: `backend/server.js` — add function after `let scalePort = connectScale();` (around line 80), before the API routes section

- [ ] **Step 1: Add the `printReceipt` function**

Find the line `let scalePort = connectScale();` and add the following block immediately after it:

```js
async function printReceipt(jobData, type) {
    if (!scalePort || !scalePort.isOpen) {
        throw new Error('Printer not connected');
    }

    const ESC = 0x1b;
    const GS  = 0x1d;
    const LF  = 0x0a;
    const WIDTH = 32;

    const cmd = (...bytes) => Buffer.from(bytes);
    const txt = (str) => Buffer.from(str, 'utf8');
    const lf  = () => Buffer.from([LF]);

    const INIT      = cmd(ESC, 0x40);
    const BOLD_ON   = cmd(ESC, 0x45, 0x01);
    const BOLD_OFF  = cmd(ESC, 0x45, 0x00);
    const CENTER    = cmd(ESC, 0x61, 0x01);
    const RIGHT     = cmd(ESC, 0x61, 0x02);
    const LEFT      = cmd(ESC, 0x61, 0x00);
    const CUT       = cmd(GS,  0x56, 0x42, 0x00);
    const DASHES    = txt('-'.repeat(WIDTH));

    const now = new Date();
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const dateStr = istDate.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = istDate.toLocaleTimeString('en-IN', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });

    function row(label, value) {
        const line = label + value.padStart(WIDTH - label.length);
        return txt(line.slice(0, WIDTH));
    }

    function barcode128(data) {
        const dataBytes = Buffer.from(data, 'utf8');
        return Buffer.concat([cmd(GS, 0x6b, 0x49, dataBytes.length), dataBytes]);
    }

    const parts = [INIT];

    // Header
    parts.push(CENTER, BOLD_ON, txt('Aum Polish'), BOLD_OFF, lf());
    parts.push(RIGHT, txt(`${dateStr} ${timeStr}`), lf());
    parts.push(LEFT, DASHES, lf());

    if (type === 'initial') {
        parts.push(txt(row('Job:', jobData.job_number)), lf());
        parts.push(txt(row('Customer:', `${jobData.customer_name} (${jobData.customer_id})`)), lf());
        parts.push(txt(row('Aavak Vajan:', `${Math.floor(jobData.initial_weight)}g`)), lf());
        parts.push(DASHES, lf());
        parts.push(CENTER, barcode128(jobData.job_number), lf(), lf());
    } else {
        parts.push(txt(row('Customer:', `${jobData.customer_name} (${jobData.customer_id})`)), lf());
        parts.push(txt(row('Javak Vajan:', `${Math.floor(jobData.final_weight)}g`)), lf());
        parts.push(txt(row('Aavak Vajan:', `${Math.floor(jobData.initial_weight)}g`)), lf());
        parts.push(txt(row('Bag Vajan:', `${Math.floor(jobData.plastic_bag_weight)}g`)), lf());
        parts.push(txt(row('Ghat:', `${Math.floor(jobData.ghat)}g`)), lf());
        parts.push(txt(row('Fine:', `${Math.floor(jobData.fine_amount)}g`)), lf());
        parts.push(txt(row('Cust. Bag:', `${Math.floor(jobData.customer_bag_weight || 0)}g`)), lf());
        parts.push(DASHES, lf());
        parts.push(CENTER, barcode128(jobData.job_number), lf(), lf());
    }

    parts.push(CUT);

    const data = Buffer.concat(parts);

    return new Promise((resolve, reject) => {
        scalePort.write(data, (err) => {
            if (err) return reject(err);
            scalePort.drain((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}
```

- [ ] **Step 2: Verify server still starts without error**

```bash
cd /Users/harsh/personal-project/backend && node -e "require('./server.js')" &
sleep 2 && curl -s http://localhost:3001/ | grep -q "running" && echo "OK" || echo "FAIL"
kill %1
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(printer): add printReceipt ESC/POS function"
```

---

### Task 2: Wire `printReceipt` into job create endpoint + add reprint endpoint

**Files:**
- Modify: `backend/server.js` — `POST /api/jobs/initial` (around line 784) and add new reprint endpoint after the complete endpoint

- [ ] **Step 1: Update the job create response to call `printReceipt`**

In `POST /api/jobs/initial`, find the inner `db.get` callback that currently does:

```js
                        console.log('📋 Returning complete job details');
                        res.json({
                            success: true,
                            job: row,
                            message: `Job ${jobNumber} created successfully!`
                        });
```

Replace it with:

```js
                        console.log('📋 Returning complete job details');
                        printReceipt(row, 'initial')
                            .then(() => {
                                console.log(`🖨️  Receipt printed for job ${jobNumber}`);
                                res.json({
                                    success: true,
                                    job: row,
                                    message: `Job ${jobNumber} created successfully!`,
                                    printError: null
                                });
                            })
                            .catch((printErr) => {
                                console.error('❌ Print error:', printErr.message);
                                res.json({
                                    success: true,
                                    job: row,
                                    message: `Job ${jobNumber} created successfully!`,
                                    printError: printErr.message
                                });
                            });
```

- [ ] **Step 2: Add the reprint endpoint**

Find the `// Weight endpoint` comment (around line 1093) and add the following block immediately before it:

```js
// Reprint receipt for a job
app.post('/api/jobs/:jobNumber/reprint', (req, res) => {
    const { jobNumber } = req.params;
    console.log(`🖨️  Reprint requested for job: ${jobNumber}`);

    db.get(
        `SELECT j.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
         FROM jobs j
         JOIN customers c ON j.customer_id = c.customer_id
         WHERE j.job_number = ?`,
        [jobNumber],
        async (err, job) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

            const type = job.delivered_at ? 'completion' : 'initial';
            try {
                await printReceipt(job, type);
                console.log(`✅ Reprint successful for job ${jobNumber}`);
                res.json({ success: true });
            } catch (printErr) {
                console.error(`❌ Reprint failed for job ${jobNumber}:`, printErr.message);
                res.json({ success: false, error: printErr.message });
            }
        }
    );
});
```

- [ ] **Step 3: Test job create returns `printError`**

```bash
cd /Users/harsh/personal-project/backend && node server.js &
sleep 2
curl -s -X POST http://localhost:3001/api/jobs/initial \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"ABC","weight_captures":[100]}' | python3 -m json.tool | grep -E "printError|success"
kill %1
```

Expected (printer not connected = mock mode):
```
"printError": "Printer not connected",
"success": true,
```

- [ ] **Step 4: Test reprint endpoint**

```bash
cd /Users/harsh/personal-project/backend && node server.js &
sleep 2
# Use a real job number from your database
JOB=$(curl -s http://localhost:3001/api/jobs | python3 -c "import sys,json; jobs=json.load(sys.stdin); print(jobs[0]['job_number'])" 2>/dev/null || echo "ABC0001")
curl -s -X POST http://localhost:3001/api/jobs/$JOB/reprint | python3 -m json.tool
kill %1
```

Expected (printer not connected):
```json
{
  "success": false,
  "error": "Printer not connected"
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat(printer): wire printReceipt into job create and add reprint endpoint"
```

---

### Task 3: Wire `printReceipt` into job complete endpoint

**Files:**
- Modify: `backend/server.js` — `PUT /api/jobs/:jobNumber/complete` (around line 1084)

- [ ] **Step 1: Update the job complete response to call `printReceipt`**

In `PUT /api/jobs/:jobNumber/complete`, find the line that currently does:

```js
                            res.json(response);
```

(This is inside the innermost `db.get` callback, after `const response = { success: true, ... }`.)

Replace it with:

```js
                            printReceipt(updatedJob, 'completion')
                                .then(() => {
                                    console.log(`🖨️  Completion receipt printed for job ${jobNumber}`);
                                    res.json({ ...response, printError: null });
                                })
                                .catch((printErr) => {
                                    console.error('❌ Print error:', printErr.message);
                                    res.json({ ...response, printError: printErr.message });
                                });
```

- [ ] **Step 2: Test job complete returns `printError`**

```bash
cd /Users/harsh/personal-project/backend && node server.js &
sleep 2
# Use a real incomplete job number from your database
JOB="ABC0001"  # replace with an actual open job
curl -s -X PUT http://localhost:3001/api/jobs/$JOB/complete \
  -H "Content-Type: application/json" \
  -d '{"javak_vajan_captures":[100],"bag_vajan":5,"customer_bag_weight":0,"ghat":0}' \
  | python3 -m json.tool | grep -E "printError|success"
kill %1
```

Expected:
```
"printError": "Printer not connected",
"success": true,
```

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(printer): wire printReceipt into job complete endpoint"
```

---

### Task 4: Update InitialBill.js — warning banner + Reprint button

**Files:**
- Modify: `frontend/src/components/InitialBill.js`
- Modify: `frontend/src/components/InitialBill.css`

- [ ] **Step 1: Add `printError` state and reprint handler**

At the top of the `InitialBill` component, find the existing state declarations (around line 27):

```js
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState(''); // 'success' or 'error'
```

Add after them:

```js
    const [printError, setPrintError] = useState(null);
    const [reprinting, setReprinting] = useState(false);
    const [lastJobNumber, setLastJobNumber] = useState(null);
```

- [ ] **Step 2: Clear stale print error on submit and read `printError` from response**

Find the job create success block (around line 197).

First, find the `setLoading(true)` call at the start of the submit handler and add `setPrintError(null)` immediately after it:

```js
        setLoading(true);
        setPrintError(null);
```

Then find the success response handling:

```js
            showMessage(`Job ${response.data.job.job_number} created successfully! Total weight: ${response.data.job.initial_weight}g`, 'success');

            // Download PDF receipt
            await downloadReceipt(response.data.job.job_number);

            // Reset form
            resetForm();
```

Replace with:

```js
            showMessage(`Job ${response.data.job.job_number} created successfully! Total weight: ${response.data.job.initial_weight}g`, 'success');

            setLastJobNumber(response.data.job.job_number);
            setPrintError(response.data.printError || null);

            // PDF download unchanged
            await downloadReceipt(response.data.job.job_number);

            resetForm();
```

- [ ] **Step 3: Add reprint handler function**

After the `downloadReceipt` function (around line 233), add:

```js
    const handleReprint = async () => {
        if (!lastJobNumber) return;
        setReprinting(true);
        try {
            const response = await axios.post(`${API_BASE}/api/jobs/${lastJobNumber}/reprint`);
            if (response.data.success) {
                setPrintError(null);
                showMessage('Receipt printed successfully!', 'success');
            } else {
                showMessage(`Reprint failed: ${response.data.error}`, 'error');
            }
        } catch (error) {
            showMessage('Reprint failed. Check printer connection.', 'error');
        } finally {
            setReprinting(false);
        }
    };
```

- [ ] **Step 4: Add warning banner JSX**

Find the message display block in the JSX (around line 276):

```jsx
            {message && (
                <div className={`message ${messageType}`}>
                    {message}
                </div>
            )}
```

Add the print warning banner immediately after it:

```jsx
            {printError && (
                <div className="message warning">
                    ⚠️ Receipt not printed: {printError}
                    <button
                        className="reprint-btn"
                        onClick={handleReprint}
                        disabled={reprinting}
                    >
                        {reprinting ? 'Printing...' : '🖨️ Reprint'}
                    </button>
                </div>
            )}
```

- [ ] **Step 5: Add CSS for warning and reprint button**

In `frontend/src/components/InitialBill.css`, find the `.message.error` rule and add after it:

```css
.message.warning {
    background-color: #fff3cd;
    color: #856404;
    border: 1px solid #ffeaa7;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.reprint-btn {
    background: #856404;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
}

.reprint-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
```

- [ ] **Step 6: Verify in browser**

Start the backend and frontend:
```bash
cd /Users/harsh/personal-project/backend && node server.js &
cd /Users/harsh/personal-project && npm start --prefix frontend
```

1. Create a job — since printer is not connected (mock mode), you should see:
   - Green success banner: "Job XYZ created successfully!"
   - Yellow warning banner: "⚠️ Receipt not printed: Printer not connected" + "🖨️ Reprint" button
2. Click Reprint — should show "Reprint failed: Printer not connected" (expected in mock mode)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/InitialBill.js frontend/src/components/InitialBill.css
git commit -m "feat(printer): add print warning banner and reprint button to InitialBill"
```

---

### Task 5: Update CompleteJob.js — warning banner + Reprint button

**Files:**
- Modify: `frontend/src/components/CompleteJob.js`

- [ ] **Step 1: Add `printError` state and reprint handler**

At the top of the `CompleteJob` component, find the existing state declarations (around line 23):

```js
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
```

Add after them:

```js
    const [printError, setPrintError] = useState(null);
    const [reprinting, setReprinting] = useState(false);
```

- [ ] **Step 2: Clear stale print error on submit and read `printError` from response**

First, find `setLoading(true)` at the start of the complete handler and add `setPrintError(null)` after it:

```js
        setLoading(true);
        setPrintError(null);
```

Then find the completion success block (around line 271):

```js
            // Show success message
            const successMsg = `Job ${job.job_number} completed successfully! Fine: ${calculations.fine}g`;
            showMessage(successMsg, 'success');

            // Download completion PDF receipt
            await downloadCompletionReceipt(job.job_number);
```

Replace with:

```js
            const successMsg = `Job ${job.job_number} completed successfully! Fine: ${calculations.fine}g`;
            showMessage(successMsg, 'success');

            setPrintError(response.data.printError || null);

            // PDF download unchanged
            await downloadCompletionReceipt(job.job_number);
```

- [ ] **Step 3: Add reprint handler**

After the `downloadCompletionReceipt` function, add:

```js
    const handleReprint = async () => {
        if (!job) return;
        setReprinting(true);
        try {
            const response = await axios.post(`${API_BASE}/api/jobs/${job.job_number}/reprint`);
            if (response.data.success) {
                setPrintError(null);
                showMessage('Receipt printed successfully!', 'success');
            } else {
                showMessage(`Reprint failed: ${response.data.error}`, 'error');
            }
        } catch (error) {
            showMessage('Reprint failed. Check printer connection.', 'error');
        } finally {
            setReprinting(false);
        }
    };
```

- [ ] **Step 4: Add warning banner JSX**

Find the message display block in CompleteJob's JSX (around line 303):

```jsx
            {message && (
                <div className={`message ${messageType}`}>
                    {message}
                </div>
            )}
```

Add immediately after:

```jsx
            {printError && (
                <div className="message warning">
                    ⚠️ Receipt not printed: {printError}
                    <button
                        className="reprint-btn"
                        onClick={handleReprint}
                        disabled={reprinting}
                    >
                        {reprinting ? 'Printing...' : '🖨️ Reprint'}
                    </button>
                </div>
            )}
```

- [ ] **Step 5: Add reprint button CSS to CompleteJob.css**

In `frontend/src/components/CompleteJob.css`, find the `.message.warning` rule (line 32) and update it, then add the reprint button style after it:

```css
.message.warning {
    background-color: #fff3cd;
    color: #856404;
    border: 1px solid #ffeaa7;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.reprint-btn {
    background: #856404;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
}

.reprint-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
```

- [ ] **Step 6: Verify in browser**

Complete a job in the UI. Since printer is not connected (mock mode), you should see:
- Green success banner: "Job XYZ completed successfully!"
- Yellow warning banner: "⚠️ Receipt not printed: Printer not connected" + "🖨️ Reprint" button

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CompleteJob.js frontend/src/components/CompleteJob.css
git commit -m "feat(printer): add print warning banner and reprint button to CompleteJob"
```
