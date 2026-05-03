# Thermal Receipt Initial Slip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign initial job receipt PDF from 8cm to 5.8cm thermal format with bordered table layout

**Architecture:** Modify the `generateReceipt()` function in backend to reduce width, replace label/value pairs with bordered table cells, and reposition barcode to leave space for handwritten remarks

**Tech Stack:** Node.js, Express, PDFKit

---

## File Structure

**Modified Files:**
- `backend/server.js:277-373` - `generateReceipt()` function

**No New Files Required**

---

## Task 1: Update PDF Dimensions and Margins

**Files:**
- Modify: `backend/server.js:277-373`

- [ ] **Step 1: Update PDFDocument size and margin**

Replace lines 280-283 in `backend/server.js`:

```javascript
// OLD (lines 280-283):
// 8cm x 6cm = 227 x 170 points (at 72 DPI)
const doc = new PDFDocument({
    size: [227, 170],
    margin: 10
});

// NEW:
// 5.8cm x 7.5cm = 165 x 213 points (at 72 DPI) - thermal receipt format
const doc = new PDFDocument({
    size: [165, 213],
    margin: 5
});
```

- [ ] **Step 2: Verify server can restart without errors**

Run:
```bash
cd backend
node server.js
```

Expected output: Server starts on port 3001 without errors

Press Ctrl+C to stop server.

- [ ] **Step 3: Commit dimension changes**

```bash
git add backend/server.js
git commit -m "refactor(receipt): update PDF to thermal width (5.8cm)"
```

---

## Task 2: Update Header Layout for New Width

**Files:**
- Modify: `backend/server.js:310-318`

- [ ] **Step 1: Adjust header text positioning**

Replace lines 310-318 in `backend/server.js`:

```javascript
// OLD (lines 310-318):
// Header row: "Aum Polish" (left) and Date/Time (right)
doc.fontSize(10).font('Helvetica-Bold');
doc.text('Aum Polish', 10, 10, { width: 100, align: 'left' });
doc.fontSize(7).font('Helvetica');
doc.text(dateStr, 120, 10, { width: 97, align: 'right' });
doc.text(timeStr, 120, 18, { width: 97, align: 'right' });

// Horizontal line under header
doc.moveTo(10, 28).lineTo(217, 28).stroke();

// NEW:
// Header row: "Aum Polish" (left) and Date/Time (right)
doc.fontSize(10).font('Helvetica-Bold');
doc.text('Aum Polish', 5, 5, { width: 80, align: 'left' });
doc.fontSize(7).font('Helvetica');
doc.text(dateStr, 85, 5, { width: 75, align: 'right' });
doc.text(timeStr, 85, 13, { width: 75, align: 'right' });

// Horizontal line under header
doc.moveTo(5, 23).lineTo(160, 23).stroke();
```

- [ ] **Step 2: Test server restart**

Run:
```bash
cd backend
node server.js
```

Expected: Server starts without errors. Press Ctrl+C to stop.

- [ ] **Step 3: Commit header changes**

```bash
git add backend/server.js
git commit -m "refactor(receipt): adjust header for thermal width"
```

---

## Task 3: Replace Label/Value Layout with Bordered Table

**Files:**
- Modify: `backend/server.js:320-349`

- [ ] **Step 1: Remove old label/value layout code**

Delete lines 320-349 in `backend/server.js` (from `// Customer Name` through the last `doc.moveTo...stroke()` before the barcode section).

- [ ] **Step 2: Add bordered table generation code**

Insert this code after line 318 (after the header horizontal line):

```javascript
// Data table with bordered cells
const tableStartY = 28;
const tableX = 5;
const tableWidth = 155; // 165 - (2 * 5 margin)
const labelWidth = 62; // 40% of table width
const valueWidth = 93; // 60% of table width
const rowHeight = 15;
const cellPadding = 3;

const rows = [
    { label: 'Job Number', value: jobData.job_number },
    { label: 'Name', value: `${jobData.customer_name} (${jobData.customer_id})` },
    { label: 'Aavak Vajan', value: `${Math.floor(jobData.initial_weight)} g` }
];

let currentY = tableStartY;

rows.forEach((row) => {
    // Draw cell borders for label cell
    doc.rect(tableX, currentY, labelWidth, rowHeight).stroke();

    // Draw cell borders for value cell
    doc.rect(tableX + labelWidth, currentY, valueWidth, rowHeight).stroke();

    // Draw label text (bold, left-aligned)
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text(row.label, tableX + cellPadding, currentY + cellPadding, {
        width: labelWidth - (2 * cellPadding),
        height: rowHeight - (2 * cellPadding),
        align: 'left',
        lineBreak: false
    });

    // Draw value text (regular, left-aligned)
    doc.fontSize(8).font('Helvetica');
    doc.text(row.value, tableX + labelWidth + cellPadding, currentY + cellPadding, {
        width: valueWidth - (2 * cellPadding),
        height: rowHeight - (2 * cellPadding),
        align: 'left',
        lineBreak: false
    });

    currentY += rowHeight;
});
```

- [ ] **Step 3: Test server restart**

Run:
```bash
cd backend
node server.js
```

Expected: Server starts without errors. Press Ctrl+C to stop.

- [ ] **Step 4: Commit table implementation**

```bash
git add backend/server.js
git commit -m "feat(receipt): implement bordered table layout for data fields"
```

---

## Task 4: Update Barcode Positioning

**Files:**
- Modify: `backend/server.js:351-366`

- [ ] **Step 1: Adjust barcode to left-aligned with space for remarks**

Replace lines 351-366 in `backend/server.js`:

```javascript
// OLD (lines 351-366):
// Barcode section at bottom (shifted left)
const bottomY = 110;

if (jobData.barcode) {
    try {
        const barcodeBuffer = Buffer.from(jobData.barcode, 'base64');
        // Position barcode towards left
        const barcodeWidth = 150;
        const barcodeX = 20; // Shifted left from center
        doc.image(barcodeBuffer, barcodeX, bottomY, {
            fit: [barcodeWidth, 40]
        });
    } catch (err) {
        console.error('Error adding barcode to PDF:', err);
    }
}

// NEW:
// Barcode section - positioned left with space for handwritten remarks on right
const barcodeY = currentY + 8; // Small gap after table
const barcodeX = 10;
const barcodeWidth = 100; // Leave ~55pt on right for remarks
const barcodeHeight = 35;

if (jobData.barcode) {
    try {
        const barcodeBuffer = Buffer.from(jobData.barcode, 'base64');
        doc.image(barcodeBuffer, barcodeX, barcodeY, {
            fit: [barcodeWidth, barcodeHeight]
        });
    } catch (err) {
        console.error('Error adding barcode to PDF:', err);
    }
}
```

- [ ] **Step 2: Test server restart**

Run:
```bash
cd backend
node server.js
```

Expected: Server starts without errors. Press Ctrl+C to stop.

- [ ] **Step 3: Commit barcode positioning**

```bash
git add backend/server.js
git commit -m "refactor(receipt): position barcode left with space for remarks"
```

---

## Task 5: End-to-End Testing and Verification

**Files:**
- Test: Full job creation flow
- Verify: PDF receipt output

- [ ] **Step 1: Start backend server**

Run:
```bash
cd backend
node server.js
```

Expected output:
```
🚀 Server starting on port 3001...
📊 Database initialized
✅ Server running on http://localhost:3001
```

Keep this terminal open.

- [ ] **Step 2: Start frontend (in new terminal)**

Run:
```bash
cd frontend
npm start
```

Expected: Frontend starts on port 3000. Browser should open automatically.

- [ ] **Step 3: Create test job**

In the browser:
1. Navigate to "Create Initial Bill" tab
2. Select any customer (or create new one)
3. Capture at least one weight (or manually add weight)
4. Click "Create Bill & Print Receipt"

Expected:
- Success message appears
- PDF downloads automatically

- [ ] **Step 4: Verify PDF receipt**

Open the downloaded PDF and verify:
- Width is noticeably narrower (thermal format)
- Header shows "Aum Polish" on left, date/time on right
- Horizontal line under header
- Table with 3 bordered rows:
  - Job Number | [value]
  - Name | [Customer Name (ID)]
  - Aavak Vajan | [XXX g]
- Barcode appears at bottom left
- Empty space on right side of barcode (for remarks)
- Minimal white space throughout
- All text is readable and fits within cells

- [ ] **Step 5: Test edge cases**

Create additional test jobs with:
1. Long customer name (25+ characters) - verify it doesn't overflow cell
2. Large weight value (9999 g) - verify it fits
3. Customer with no phone/address - verify it still works

Expected: All receipts generate successfully with proper formatting.

- [ ] **Step 6: Optional - Print test**

If thermal printer is available:
1. Print one of the test receipts
2. Verify physical dimensions (~5.8cm width)
3. Verify barcode is scannable
4. Verify borders print cleanly
5. Test writing remarks in empty space on right

- [ ] **Step 7: Clean up test jobs (optional)**

If desired, delete test jobs from database:
```bash
cd backend
sqlite3 jewelry_crm.db
DELETE FROM jobs WHERE job_number LIKE '%test%';
.exit
```

- [ ] **Step 8: Final commit**

```bash
git add backend/server.js
git commit -m "test: verify thermal receipt format end-to-end

Tested:
- Receipt generation with new 5.8cm width
- Bordered table layout for all fields
- Barcode positioning with space for remarks
- Edge cases (long names, large weights)
- Physical print compatibility

All tests passing. Receipt matches design spec.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Testing Checklist

After completing all tasks, verify:

- [ ] PDF width is 5.8cm (165 points)
- [ ] PDF height auto-adjusts to content (~7-7.5cm)
- [ ] Header maintains "Aum Polish" + date/time layout
- [ ] Table has 3 rows with visible borders
- [ ] Cell borders are 0.5pt and render cleanly
- [ ] Text fits within all cells without overflow
- [ ] Barcode is left-aligned
- [ ] Right side has ~3-4cm empty space for remarks
- [ ] Minimal white space throughout layout
- [ ] All existing job creation functionality works
- [ ] Receipt downloads successfully
- [ ] Barcode is scannable (if tested with scanner)

---

## Rollback Plan

If issues occur, revert to previous version:

```bash
git log --oneline -5  # Find commit before changes
git revert <commit-hash>  # Revert specific commit
# OR
git reset --hard <commit-hash-before-changes>  # Hard reset (use with caution)
git push --force  # Only if already pushed
```

---

## Success Criteria

1. Receipt width reduced from 8cm to 5.8cm
2. Data fields displayed in bordered table format
3. Minimal white space with compact layout
4. Barcode positioned left with space for handwritten remarks
5. All existing functionality preserved
6. Receipt prints correctly on thermal printer
7. All tests pass
8. Code committed with clear messages
