# Daily Ledger System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a date-based ledger system that displays completed jobs with detailed calculations and supports CSV/PDF export.

**Architecture:** Single unified backend endpoint (`/api/ledger`) handles date filtering and multiple response formats (JSON/CSV/PDF). Frontend React component provides interactive table with column visibility controls and download buttons.

**Tech Stack:** Node.js + Express + SQLite3, React 19, PDFKit (already installed)

---

## File Structure

### Backend
- **Modify:** `backend/server.js`
  - Add `/api/ledger` endpoint with format handling
  - Add CSV generation function
  - Add PDF ledger generation function (similar to receipt functions)

### Frontend
- **Modify:** `frontend/src/App.js`
  - Add third tab for Daily Ledger
  - Import and render DailyLedger component

- **Create:** `frontend/src/components/DailyLedger.js`
  - Main ledger component with date selection, table, downloads

- **Create:** `frontend/src/components/DailyLedger.css`
  - Styling for ledger component

---

## Tasks

### Task 1: Backend - API Endpoint Structure and Validation

**Files:**
- Modify: `backend/server.js` (add after line 1047, before server startup)

- [ ] **Step 1: Add ledger endpoint with parameter validation**

Add this code after the `/api/customers/:customerId/next-job-number` endpoint (around line 1047):

```javascript
// Get ledger data with date filtering and format support
app.get('/api/ledger', (req, res) => {
    const { start_date, end_date, format = 'json', columns } = req.query;

    console.log(`📊 Fetching ledger: ${start_date} to ${end_date || start_date}, format: ${format}`);

    // Validation: start_date required
    if (!start_date) {
        return res.status(400).json({ error: 'start_date is required' });
    }

    // Validation: date format (basic check for YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start_date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Default end_date to start_date if not provided
    const endDate = end_date || start_date;

    // Validation: end_date format
    if (!dateRegex.test(endDate)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Validation: end_date >= start_date
    if (new Date(endDate) < new Date(start_date)) {
        return res.status(400).json({ error: 'end_date must be >= start_date' });
    }

    // Validation: format parameter
    if (!['json', 'csv', 'pdf'].includes(format)) {
        return res.status(400).json({ error: 'format must be json, csv, or pdf' });
    }

    // Parse columns parameter (comma-separated)
    const validColumns = [
        'job_number', 'customer_id', 'customer_name',
        'aavak_vajan', 'javak_vajan', 'bag_vajan',
        'customer_bag_weight', 'ghat', 'fine'
    ];

    let selectedColumns = validColumns; // Default: all columns
    if (columns) {
        const requestedColumns = columns.split(',').map(c => c.trim());
        const filteredColumns = requestedColumns.filter(c => validColumns.includes(c));
        if (filteredColumns.length > 0) {
            selectedColumns = filteredColumns;
        }
    }

    // Query database for completed jobs in date range
    const query = `
        SELECT
            j.job_number,
            j.customer_id,
            c.name as customer_name,
            j.initial_weight as aavak_vajan,
            j.final_weight as javak_vajan,
            j.plastic_bag_weight as bag_vajan,
            j.customer_bag_weight,
            j.ghat,
            j.fine_amount as fine,
            j.delivered_at
        FROM jobs j
        JOIN customers c ON j.customer_id = c.customer_id
        WHERE j.status = 'completed'
          AND DATE(j.delivered_at) >= DATE(?)
          AND DATE(j.delivered_at) <= DATE(?)
        ORDER BY j.delivered_at DESC
    `;

    db.all(query, [start_date, endDate], (err, jobs) => {
        if (err) {
            console.error('❌ Database error:', err);
            return res.status(500).json({ error: 'Database error occurred' });
        }

        console.log(`✅ Found ${jobs.length} completed jobs`);

        // Handle NULL fine_amount (treat as 0)
        const processedJobs = jobs.map(job => ({
            ...job,
            fine: job.fine || 0
        }));

        // Calculate totals
        const totals = processedJobs.reduce((acc, job) => ({
            aavak_vajan: acc.aavak_vajan + (job.aavak_vajan || 0),
            javak_vajan: acc.javak_vajan + (job.javak_vajan || 0),
            bag_vajan: acc.bag_vajan + (job.bag_vajan || 0),
            customer_bag_weight: acc.customer_bag_weight + (job.customer_bag_weight || 0),
            ghat: acc.ghat + (job.ghat || 0),
            fine: acc.fine + (job.fine || 0)
        }), {
            aavak_vajan: 0,
            javak_vajan: 0,
            bag_vajan: 0,
            customer_bag_weight: 0,
            ghat: 0,
            fine: 0
        });

        // Respond based on format
        if (format === 'json') {
            res.json({
                start_date: start_date,
                end_date: endDate,
                jobs: processedJobs,
                totals: totals
            });
        } else if (format === 'csv') {
            generateLedgerCSV(start_date, endDate, processedJobs, totals, selectedColumns, res);
        } else if (format === 'pdf') {
            generateLedgerPDF(start_date, endDate, processedJobs, totals, selectedColumns, res);
        }
    });
});
```

- [ ] **Step 2: Test endpoint with curl**

Start backend if not running:
```bash
cd backend && node server.js
```

Test validation (missing start_date):
```bash
curl "http://localhost:3001/api/ledger"
```
Expected: `{"error":"start_date is required"}`

Test validation (invalid date format):
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-13-45"
```
Expected: `{"error":"Invalid date format. Use YYYY-MM-DD"}`

Test validation (end_date < start_date):
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05&end_date=2026-05-01"
```
Expected: `{"error":"end_date must be >= start_date"}`

Test validation (invalid format):
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05&format=xml"
```
Expected: `{"error":"format must be json, csv, or pdf"}`

Test valid request (will fail until we implement CSV/PDF functions):
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05"
```
Expected: JSON response with jobs array and totals

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(ledger): add API endpoint with validation

Add /api/ledger endpoint with:
- Date range filtering (start_date, end_date)
- Format support (json, csv, pdf)
- Column filtering parameter
- Input validation for all parameters
- Totals calculation across all jobs

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Backend - CSV Export Generation

**Files:**
- Modify: `backend/server.js` (add before the ledger endpoint, around line 511)

- [ ] **Step 1: Add CSV generation function**

Add this function after the `generateCompletionReceipt()` function (around line 510):

```javascript
// Generate CSV ledger export
function generateLedgerCSV(startDate, endDate, jobs, totals, columns, res) {
    console.log(`📄 Generating CSV ledger for ${startDate} to ${endDate}`);

    // Column definitions
    const columnDefs = {
        job_number: { header: 'Job Number', key: 'job_number' },
        customer_id: { header: 'Customer ID', key: 'customer_id' },
        customer_name: { header: 'Customer Name', key: 'customer_name' },
        aavak_vajan: { header: 'Aavak Vajan (g)', key: 'aavak_vajan' },
        javak_vajan: { header: 'Javak Vajan (g)', key: 'javak_vajan' },
        bag_vajan: { header: 'Bag Vajan (g)', key: 'bag_vajan' },
        customer_bag_weight: { header: 'Customer Bag Weight (g)', key: 'customer_bag_weight' },
        ghat: { header: 'Ghat (g)', key: 'ghat' },
        fine: { header: 'Fine (g)', key: 'fine' }
    };

    // Build CSV content
    let csv = '';

    // Title and date range
    csv += 'Daily Ledger Report\n';
    csv += `Date Range: ${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}\n`;
    csv += '\n';

    // Headers
    const headers = columns.map(col => columnDefs[col].header);
    csv += headers.join(',') + '\n';

    // Data rows
    jobs.forEach(job => {
        const row = columns.map(col => {
            const value = job[columnDefs[col].key];
            // Handle null/undefined
            if (value === null || value === undefined) {
                return '0';
            }
            // Escape commas in text fields
            if (typeof value === 'string' && value.includes(',')) {
                return `"${value}"`;
            }
            // Numbers: floor to remove decimals
            if (typeof value === 'number') {
                return Math.floor(value);
            }
            return value;
        });
        csv += row.join(',') + '\n';
    });

    // Empty line before totals
    csv += '\n';

    // Totals row
    const totalsRow = columns.map((col, index) => {
        if (index === 0) {
            return 'TOTAL';
        }
        const key = columnDefs[col].key;
        if (totals[key] !== undefined) {
            return Math.floor(totals[key]);
        }
        return '';
    });
    csv += totalsRow.join(',') + '\n';

    // Generate filename
    const filename = startDate === endDate
        ? `ledger_${startDate}.csv`
        : `ledger_${startDate}_to_${endDate}.csv`;

    // Send CSV file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

    console.log(`✅ CSV ledger sent: ${filename}`);
}

// Helper function to format date for display
function formatDateForDisplay(isoDate) {
    const date = new Date(isoDate + 'T00:00:00Z'); // Parse as UTC to avoid timezone issues
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
```

- [ ] **Step 2: Test CSV export**

Test CSV download (all columns):
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05&format=csv" --output test_ledger.csv
cat test_ledger.csv
```
Expected: CSV file with headers, data rows, and totals row

Test CSV with selected columns:
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05&format=csv&columns=job_number,customer_name,fine" --output test_ledger_filtered.csv
cat test_ledger_filtered.csv
```
Expected: CSV file with only 3 columns

- [ ] **Step 3: Clean up test files**

```bash
rm test_ledger.csv test_ledger_filtered.csv
```

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(ledger): add CSV export generation

Implement generateLedgerCSV() with:
- Title and date range header
- Column filtering support
- Data rows with proper escaping
- Totals row
- Dynamic filename based on date range

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Backend - PDF Export Generation

**Files:**
- Modify: `backend/server.js` (add after CSV function, around line 575)

- [ ] **Step 1: Add PDF generation function**

Add this function after the `generateLedgerCSV()` function:

```javascript
// Generate PDF ledger export
async function generateLedgerPDF(startDate, endDate, jobs, totals, columns, res) {
    try {
        console.log(`📄 Generating PDF ledger for ${startDate} to ${endDate}`);

        // A4 landscape: 842 x 595 points
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margin: 20
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);

            // Generate filename
            const filename = startDate === endDate
                ? `ledger_${startDate}.pdf`
                : `ledger_${startDate}_to_${endDate}.pdf`;

            // Send PDF file
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);

            console.log(`✅ PDF ledger sent: ${filename}`);
        });
        doc.on('error', (err) => {
            console.error('❌ PDF generation error:', err);
            res.status(500).json({ error: 'Failed to generate PDF' });
        });

        // Header section
        doc.fontSize(14).font('Helvetica-Bold');
        doc.text('Aum Polish', 0, 30, { align: 'center' });
        doc.fontSize(12).font('Helvetica');
        doc.text('Daily Ledger Report', 0, 50, { align: 'center' });
        doc.fontSize(10);
        doc.text(`${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`, 0, 70, { align: 'center' });

        // Horizontal line
        doc.moveTo(20, 90).lineTo(822, 90).stroke();

        // Column definitions
        const columnDefs = {
            job_number: { header: 'Job Number', width: 70 },
            customer_id: { header: 'Cust ID', width: 50 },
            customer_name: { header: 'Name', width: 90 },
            aavak_vajan: { header: 'Aavak (g)', width: 60 },
            javak_vajan: { header: 'Javak (g)', width: 60 },
            bag_vajan: { header: 'Bag (g)', width: 55 },
            customer_bag_weight: { header: 'C.Bag (g)', width: 65 },
            ghat: { header: 'Ghat (g)', width: 55 },
            fine: { header: 'Fine (g)', width: 55 }
        };

        // Calculate table dimensions
        const tableX = 20;
        let tableY = 100;
        const rowHeight = 20;
        const cellPadding = 3;

        // Filter columns
        const activeColumns = columns.map(col => ({
            key: col,
            ...columnDefs[col]
        }));

        const tableWidth = activeColumns.reduce((sum, col) => sum + col.width, 0);

        // Draw header row
        let currentX = tableX;
        doc.fontSize(9).font('Helvetica-Bold');
        activeColumns.forEach(col => {
            // Draw cell border
            doc.rect(currentX, tableY, col.width, rowHeight).stroke();

            // Draw header text
            doc.text(col.header, currentX + cellPadding, tableY + cellPadding, {
                width: col.width - (2 * cellPadding),
                height: rowHeight - (2 * cellPadding),
                align: ['aavak_vajan', 'javak_vajan', 'bag_vajan', 'customer_bag_weight', 'ghat', 'fine'].includes(col.key) ? 'right' : 'left'
            });

            currentX += col.width;
        });

        tableY += rowHeight;

        // Draw data rows
        doc.font('Helvetica').fontSize(8);
        jobs.forEach(job => {
            currentX = tableX;

            activeColumns.forEach(col => {
                // Draw cell border
                doc.rect(currentX, tableY, col.width, rowHeight).stroke();

                // Get value
                let value = job[col.key];
                if (value === null || value === undefined) {
                    value = '0';
                } else if (typeof value === 'number') {
                    value = Math.floor(value).toString();
                } else if (typeof value === 'string' && value.length > 15) {
                    // Truncate long names
                    value = value.substring(0, 12) + '...';
                }

                // Draw value text
                doc.text(value, currentX + cellPadding, tableY + cellPadding, {
                    width: col.width - (2 * cellPadding),
                    height: rowHeight - (2 * cellPadding),
                    align: ['aavak_vajan', 'javak_vajan', 'bag_vajan', 'customer_bag_weight', 'ghat', 'fine'].includes(col.key) ? 'right' : 'left'
                });

                currentX += col.width;
            });

            tableY += rowHeight;

            // Check if we need a new page
            if (tableY > 520) { // Leave space for footer
                doc.addPage();
                tableY = 40;
            }
        });

        // Draw totals row
        currentX = tableX;
        doc.font('Helvetica-Bold').fontSize(8);

        activeColumns.forEach((col, index) => {
            // Draw cell border
            doc.rect(currentX, tableY, col.width, rowHeight).stroke();

            // Get total value
            let value = '';
            if (index === 0) {
                value = 'TOTAL';
            } else if (totals[col.key] !== undefined) {
                value = Math.floor(totals[col.key]).toString();
            }

            // Draw total text
            doc.text(value, currentX + cellPadding, tableY + cellPadding, {
                width: col.width - (2 * cellPadding),
                height: rowHeight - (2 * cellPadding),
                align: index === 0 ? 'left' : 'right'
            });

            currentX += col.width;
        });

        // Footer
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        const timestamp = istDate.toLocaleString('en-IN', { timeZone: 'UTC' });

        doc.fontSize(7).font('Helvetica');
        doc.text(`Generated on ${timestamp}`, 20, 570, { align: 'left' });

        doc.end();
    } catch (err) {
        console.error('❌ Error generating PDF:', err);
        res.status(500).json({ error: 'Failed to generate PDF ledger' });
    }
}
```

- [ ] **Step 2: Test PDF export**

Test PDF download (all columns):
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05&format=pdf" --output test_ledger.pdf
```
Expected: PDF file downloads successfully

Open the PDF (macOS):
```bash
open test_ledger.pdf
```
Verify: Headers, data rows, totals row, proper formatting

Test PDF with selected columns:
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05&format=pdf&columns=job_number,customer_name,fine" --output test_ledger_filtered.pdf
open test_ledger_filtered.pdf
```
Verify: Only 3 columns shown

- [ ] **Step 3: Clean up test files**

```bash
rm test_ledger.pdf test_ledger_filtered.pdf
```

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat(ledger): add PDF export generation

Implement generateLedgerPDF() with:
- A4 landscape layout
- Header with business name and date range
- Bordered table with data
- Column filtering support
- Totals row with bold font
- Generated timestamp in footer
- Long name truncation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Frontend - Add Third Tab to App.js

**Files:**
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Add third tab state and component import**

Read current App.js:
```bash
cat frontend/src/App.js
```

Update the file to add third tab. Modify the state initialization and add the DailyLedger import:

At the top, add import:
```javascript
import DailyLedger from './components/DailyLedger';
```

In the component, update the tab state (look for existing `activeTab` state):
```javascript
const [activeTab, setActiveTab] = useState('create'); // 'create', 'complete', or 'ledger'
```

Add the third tab button in the tab navigation (look for existing tab buttons):
```javascript
<div className="tabs">
  <button
    className={activeTab === 'create' ? 'active' : ''}
    onClick={() => setActiveTab('create')}
  >
    Create Job
  </button>
  <button
    className={activeTab === 'complete' ? 'active' : ''}
    onClick={() => setActiveTab('complete')}
  >
    Complete Job
  </button>
  <button
    className={activeTab === 'ledger' ? 'active' : ''}
    onClick={() => setActiveTab('ledger')}
  >
    Daily Ledger
  </button>
</div>
```

Add the ledger component rendering in the tab content area:
```javascript
{activeTab === 'create' && <InitialBill />}
{activeTab === 'complete' && <CompleteJob />}
{activeTab === 'ledger' && <DailyLedger />}
```

- [ ] **Step 2: Verify component compiles (will show error until we create DailyLedger.js)**

```bash
cd frontend && npm start
```
Expected: Compilation error "Module not found: Can't resolve './components/DailyLedger'"

This is expected - we'll create the component in the next task.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.js
git commit -m "feat(ledger): add third tab to main app

Add Daily Ledger tab:
- New tab button in navigation
- Import DailyLedger component
- Conditional rendering based on activeTab

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Frontend - DailyLedger Component Structure

**Files:**
- Create: `frontend/src/components/DailyLedger.js`
- Create: `frontend/src/components/DailyLedger.css`

- [ ] **Step 1: Create basic component structure**

Create the component file:

```javascript
import React, { useState, useEffect } from 'react';
import './DailyLedger.css';

const DailyLedger = () => {
    // Get today's date in YYYY-MM-DD format
    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    // State
    const [startDate, setStartDate] = useState(getTodayDate());
    const [endDate, setEndDate] = useState(getTodayDate());
    const [ledgerData, setLedgerData] = useState(null);
    const [visibleColumns, setVisibleColumns] = useState({
        job_number: true,
        customer_id: true,
        customer_name: true,
        aavak_vajan: true,
        javak_vajan: true,
        bag_vajan: true,
        customer_bag_weight: true,
        ghat: true,
        fine: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Column definitions
    const columnDefs = [
        { key: 'job_number', label: 'Job Number' },
        { key: 'customer_id', label: 'Customer ID' },
        { key: 'customer_name', label: 'Customer Name' },
        { key: 'aavak_vajan', label: 'Aavak Vajan (g)', isNumeric: true },
        { key: 'javak_vajan', label: 'Javak Vajan (g)', isNumeric: true },
        { key: 'bag_vajan', label: 'Bag Vajan (g)', isNumeric: true },
        { key: 'customer_bag_weight', label: 'Customer Bag Weight (g)', isNumeric: true },
        { key: 'ghat', label: 'Ghat (g)', isNumeric: true },
        { key: 'fine', label: 'Fine (g)', isNumeric: true }
    ];

    // Fetch ledger data from API
    const fetchLedger = async (start, end) => {
        setLoading(true);
        setError(null);

        try {
            const url = `http://localhost:3001/api/ledger?start_date=${start}&end_date=${end}`;
            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch ledger');
            }

            const data = await response.json();
            setLedgerData(data);
        } catch (err) {
            console.error('Error fetching ledger:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Load today's ledger on mount
    useEffect(() => {
        fetchLedger(startDate, endDate);
    }, []); // Empty dependency array = run once on mount

    // Placeholder for now - we'll add UI in next tasks
    return (
        <div className="daily-ledger">
            <h2>Daily Ledger</h2>
            {loading && <p>Loading...</p>}
            {error && <p className="error">Error: {error}</p>}
            {ledgerData && <p>Loaded {ledgerData.jobs.length} jobs</p>}
        </div>
    );
};

export default DailyLedger;
```

- [ ] **Step 2: Create CSS file**

Create `frontend/src/components/DailyLedger.css`:

```css
.daily-ledger {
    padding: 20px;
}

.daily-ledger h2 {
    margin-bottom: 20px;
    color: #333;
}

.date-selection {
    background: #f5f5f5;
    padding: 15px;
    border-radius: 5px;
    margin-bottom: 20px;
}

.quick-buttons {
    margin-bottom: 15px;
}

.quick-buttons button {
    margin-right: 10px;
    padding: 8px 16px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.quick-buttons button:hover {
    background: #0056b3;
}

.custom-date {
    display: flex;
    align-items: center;
    gap: 10px;
}

.custom-date label {
    font-weight: bold;
}

.custom-date input[type="date"] {
    padding: 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.custom-date button {
    padding: 8px 16px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.custom-date button:hover {
    background: #218838;
}

.column-visibility {
    background: #f9f9f9;
    padding: 15px;
    border-radius: 5px;
    margin-bottom: 20px;
}

.column-visibility h3 {
    margin-top: 0;
    margin-bottom: 10px;
    font-size: 14px;
}

.column-checkboxes {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
}

.column-checkboxes label {
    display: flex;
    align-items: center;
    cursor: pointer;
}

.column-checkboxes input[type="checkbox"] {
    margin-right: 5px;
}

.ledger-table-container {
    overflow-x: auto;
    margin-bottom: 20px;
}

.ledger-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.ledger-table th,
.ledger-table td {
    padding: 10px;
    border: 1px solid #ddd;
    text-align: left;
}

.ledger-table th {
    background: #007bff;
    color: white;
    font-weight: bold;
}

.ledger-table tr:nth-child(even) {
    background: #f9f9f9;
}

.ledger-table tr:hover {
    background: #f1f1f1;
}

.ledger-table .numeric {
    text-align: right;
}

.ledger-table .negative {
    color: #dc3545;
}

.totals-row {
    background: #e9ecef !important;
    font-weight: bold;
}

.download-buttons {
    display: flex;
    gap: 10px;
}

.download-buttons button {
    padding: 10px 20px;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.download-buttons button:hover {
    background: #5a6268;
}

.download-buttons button:disabled {
    background: #ccc;
    cursor: not-allowed;
}

.error {
    color: #dc3545;
    padding: 10px;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
}

.empty-state {
    text-align: center;
    padding: 40px;
    color: #6c757d;
}
```

- [ ] **Step 3: Test component loads**

Frontend should already be running from previous step. Check browser:
Expected: See "Daily Ledger" tab, clicking it shows "Daily Ledger" heading and "Loaded X jobs"

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DailyLedger.js frontend/src/components/DailyLedger.css
git commit -m "feat(ledger): add DailyLedger component structure

Create basic component with:
- State management for dates, data, columns
- API fetch function
- Auto-load today's ledger on mount
- Column definitions
- CSS styling foundation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Frontend - Date Selection Functionality

**Files:**
- Modify: `frontend/src/components/DailyLedger.js`

- [ ] **Step 1: Add date selection handlers and UI**

Replace the placeholder return statement with full date selection UI. Find the `return` statement and replace it with:

```javascript
    // Quick date button handlers
    const handleToday = () => {
        const today = getTodayDate();
        setStartDate(today);
        setEndDate(today);
        fetchLedger(today, today);
    };

    const handleYesterday = () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        setStartDate(yesterdayStr);
        setEndDate(yesterdayStr);
        fetchLedger(yesterdayStr, yesterdayStr);
    };

    const handleLast7Days = () => {
        const today = getTodayDate();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
        setStartDate(sevenDaysAgoStr);
        setEndDate(today);
        fetchLedger(sevenDaysAgoStr, today);
    };

    const handleCustomDateSearch = () => {
        // Validation
        if (new Date(endDate) < new Date(startDate)) {
            setError('End date must be on or after start date');
            return;
        }
        fetchLedger(startDate, endDate);
    };

    return (
        <div className="daily-ledger">
            <h2>Daily Ledger</h2>

            {/* Date Selection */}
            <div className="date-selection">
                <h3>📅 Date Selection</h3>

                {/* Quick buttons */}
                <div className="quick-buttons">
                    <button onClick={handleToday}>Today</button>
                    <button onClick={handleYesterday}>Yesterday</button>
                    <button onClick={handleLast7Days}>Last 7 Days</button>
                </div>

                {/* Custom date range */}
                <div className="custom-date">
                    <label>From:</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <label>To:</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                    <button onClick={handleCustomDateSearch}>Show Ledger</button>
                </div>
            </div>

            {/* Loading/Error states */}
            {loading && <p>Loading ledger data...</p>}
            {error && <p className="error">Error: {error}</p>}

            {/* Data display placeholder */}
            {ledgerData && (
                <div>
                    <p>Ledger for {ledgerData.start_date} to {ledgerData.end_date}</p>
                    <p>Found {ledgerData.jobs.length} completed jobs</p>
                </div>
            )}
        </div>
    );
```

- [ ] **Step 2: Test date selection in browser**

Open browser to Daily Ledger tab.

Test "Today" button:
- Click "Today" button
- Expected: Fetches today's data, shows "Found X jobs"

Test "Yesterday" button:
- Click "Yesterday" button
- Expected: Fetches yesterday's data (likely 0 jobs)

Test "Last 7 Days" button:
- Click "Last 7 Days" button
- Expected: Fetches 7 days range

Test custom date:
- Change "From" date to 2026-05-01
- Change "To" date to 2026-05-05
- Click "Show Ledger"
- Expected: Fetches data for range

Test validation:
- Set "From" to 2026-05-10
- Set "To" to 2026-05-05
- Click "Show Ledger"
- Expected: Error message "End date must be on or after start date"

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DailyLedger.js
git commit -m "feat(ledger): add date selection functionality

Add date selection UI with:
- Quick buttons (Today, Yesterday, Last 7 Days)
- Custom date range inputs
- Date validation (end >= start)
- Auto-fetch on selection

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Frontend - Column Visibility Controls

**Files:**
- Modify: `frontend/src/components/DailyLedger.js`

- [ ] **Step 1: Add column visibility UI**

Add the column visibility section after the date selection div. Insert before the loading/error states:

```javascript
            {/* Column Visibility */}
            <div className="column-visibility">
                <h3>👁️ Column Visibility</h3>
                <div className="column-checkboxes">
                    {columnDefs.map(col => (
                        <label key={col.key}>
                            <input
                                type="checkbox"
                                checked={visibleColumns[col.key]}
                                onChange={(e) => {
                                    setVisibleColumns({
                                        ...visibleColumns,
                                        [col.key]: e.target.checked
                                    });
                                }}
                            />
                            {col.label}
                        </label>
                    ))}
                </div>
            </div>
```

- [ ] **Step 2: Test column visibility toggles**

Open browser to Daily Ledger tab.

Test toggling columns:
- Uncheck "Customer ID" checkbox
- Expected: Checkbox unchecked (table not shown yet, so can't verify visibility)
- Check it again
- Expected: Checkbox checked

Try toggling several columns on and off.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DailyLedger.js
git commit -m "feat(ledger): add column visibility controls

Add checkbox controls for showing/hiding columns:
- Checkbox for each of 9 columns
- State updates on toggle
- Persists during session

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Frontend - Table Display with Data

**Files:**
- Modify: `frontend/src/components/DailyLedger.js`

- [ ] **Step 1: Add table rendering**

Replace the data display placeholder (the section after error display) with the full table:

```javascript
            {/* Ledger Table */}
            {ledgerData && !loading && (
                <div className="ledger-table-container">
                    <h3>📊 Ledger for {ledgerData.start_date} to {ledgerData.end_date}</h3>

                    {ledgerData.jobs.length === 0 ? (
                        <div className="empty-state">
                            <p>No completed jobs found for this date range</p>
                        </div>
                    ) : (
                        <>
                            <table className="ledger-table">
                                <thead>
                                    <tr>
                                        {columnDefs.map(col =>
                                            visibleColumns[col.key] && (
                                                <th
                                                    key={col.key}
                                                    className={col.isNumeric ? 'numeric' : ''}
                                                >
                                                    {col.label}
                                                </th>
                                            )
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ledgerData.jobs.map((job, index) => (
                                        <tr key={index}>
                                            {columnDefs.map(col =>
                                                visibleColumns[col.key] && (
                                                    <td
                                                        key={col.key}
                                                        className={`${col.isNumeric ? 'numeric' : ''} ${
                                                            col.isNumeric && job[col.key] < 0 ? 'negative' : ''
                                                        }`}
                                                    >
                                                        {col.isNumeric
                                                            ? Math.floor(job[col.key] || 0)
                                                            : job[col.key]
                                                        }
                                                    </td>
                                                )
                                            )}
                                        </tr>
                                    ))}

                                    {/* Totals Row */}
                                    <tr className="totals-row">
                                        {columnDefs.map((col, index) =>
                                            visibleColumns[col.key] && (
                                                <td
                                                    key={col.key}
                                                    className={col.isNumeric ? 'numeric' : ''}
                                                >
                                                    {index === 0
                                                        ? 'TOTAL'
                                                        : col.isNumeric
                                                            ? Math.floor(ledgerData.totals[col.key] || 0)
                                                            : ''
                                                    }
                                                </td>
                                            )
                                        )}
                                    </tr>
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            )}
```

- [ ] **Step 2: Test table display**

Open browser to Daily Ledger tab.

Test with data:
- Should auto-load today's data
- Expected: Table shows all columns, job rows, totals row
- Verify numeric columns are right-aligned
- Verify totals are correct

Test column visibility:
- Uncheck "Customer ID"
- Expected: Customer ID column disappears from table
- Check it again
- Expected: Customer ID column reappears

Test empty state:
- Click "Yesterday" (assuming no jobs yesterday)
- Expected: "No completed jobs found for this date range" message

Test negative fine (if you have test data):
- Expected: Negative values shown in red

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DailyLedger.js
git commit -m "feat(ledger): add table display with data

Implement ledger table with:
- Header row with column labels
- Data rows for all jobs
- Totals row with sums
- Column visibility filtering
- Empty state handling
- Negative value styling (red)
- Numeric right-alignment

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Frontend - Download Functionality

**Files:**
- Modify: `frontend/src/components/DailyLedger.js`

- [ ] **Step 1: Add download handlers and buttons**

Add download handler functions before the return statement:

```javascript
    // Download CSV
    const downloadCSV = () => {
        // Get visible columns
        const visibleCols = columnDefs
            .filter(col => visibleColumns[col.key])
            .map(col => col.key);

        // Validation
        if (visibleCols.length === 0) {
            setError('Please select at least one column to export');
            return;
        }

        // Build URL
        const columnsParam = visibleCols.join(',');
        const url = `http://localhost:3001/api/ledger?start_date=${startDate}&end_date=${endDate}&format=csv&columns=${columnsParam}`;

        // Trigger download
        window.location.href = url;
    };

    // Download PDF
    const downloadPDF = () => {
        // Get visible columns
        const visibleCols = columnDefs
            .filter(col => visibleColumns[col.key])
            .map(col => col.key);

        // Validation
        if (visibleCols.length === 0) {
            setError('Please select at least one column to export');
            return;
        }

        // Build URL
        const columnsParam = visibleCols.join(',');
        const url = `http://localhost:3001/api/ledger?start_date=${startDate}&end_date=${endDate}&format=pdf&columns=${columnsParam}`;

        // Trigger download
        window.location.href = url;
    };
```

Add download buttons after the table (inside the `ledgerData && !loading` block, after the table):

```javascript
                    {/* Download Buttons */}
                    {ledgerData.jobs.length > 0 && (
                        <div className="download-buttons">
                            <button onClick={downloadCSV}>Download CSV</button>
                            <button onClick={downloadPDF}>Download PDF</button>
                        </div>
                    )}
```

- [ ] **Step 2: Test CSV download**

Open browser to Daily Ledger tab.

Test CSV with all columns:
- Make sure data is loaded
- All columns checked
- Click "Download CSV"
- Expected: CSV file downloads with all columns

Test CSV with filtered columns:
- Uncheck "Customer ID" and "Ghat"
- Click "Download CSV"
- Expected: CSV downloads without those columns

Open downloaded CSV:
```bash
open ~/Downloads/ledger_*.csv
```
Verify: Data looks correct, headers match, totals correct

- [ ] **Step 3: Test PDF download**

Test PDF with all columns:
- All columns checked
- Click "Download PDF"
- Expected: PDF file downloads

Test PDF with filtered columns:
- Uncheck "Customer ID" and "Ghat"
- Click "Download PDF"
- Expected: PDF downloads without those columns

Open downloaded PDF:
```bash
open ~/Downloads/ledger_*.pdf
```
Verify: Professional layout, all visible columns present, totals correct

- [ ] **Step 4: Test validation**

Uncheck all columns:
- Click "Download CSV"
- Expected: Error message "Please select at least one column to export"

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DailyLedger.js
git commit -m "feat(ledger): add CSV and PDF download functionality

Implement download features:
- CSV download with column filtering
- PDF download with column filtering
- Validation (at least one column required)
- Trigger browser download via URL navigation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com)"
```

---

### Task 10: Integration Testing & Polish

**Files:**
- Test entire feature end-to-end

- [ ] **Step 1: Manual integration testing**

Run through the complete test checklist:

**Backend Tests:**

Test 1: JSON format
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05" | python3 -m json.tool
```
Expected: Properly formatted JSON with jobs array and totals

Test 2: Date range
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-01&end_date=2026-05-05" | python3 -m json.tool
```
Expected: Jobs from entire range

Test 3: CSV format
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05&format=csv" --output test.csv
cat test.csv
rm test.csv
```
Expected: Properly formatted CSV with headers and totals

Test 4: PDF format
```bash
curl "http://localhost:3001/api/ledger?start_date=2026-05-05&format=pdf" --output test.pdf
open test.pdf
rm test.pdf
```
Expected: Professional PDF report

Test 5: Empty results
```bash
curl "http://localhost:3001/api/ledger?start_date=2025-01-01" | python3 -m json.tool
```
Expected: Empty jobs array with zero totals

**Frontend Tests:**

Open browser to http://localhost:3000

Test 6: Initial load
- Navigate to "Daily Ledger" tab
- Expected: Auto-loads today's data

Test 7: Quick date buttons
- Click "Today" - verify data loads
- Click "Yesterday" - verify data loads
- Click "Last 7 Days" - verify data loads

Test 8: Custom date range
- Select custom dates
- Click "Show Ledger"
- Expected: Data for that range

Test 9: Date validation
- Set end_date before start_date
- Click "Show Ledger"
- Expected: Error message

Test 10: Column visibility
- Toggle various columns on/off
- Expected: Table updates immediately

Test 11: Totals calculation
- Verify totals match sum of visible data
- Toggle column visibility
- Verify totals still correct

Test 12: CSV download
- All columns visible
- Click "Download CSV"
- Verify file downloads and opens correctly

Test 13: PDF download
- All columns visible
- Click "Download PDF"
- Verify file downloads and opens correctly

Test 14: Filtered export
- Hide some columns
- Download CSV and PDF
- Verify only visible columns exported

Test 15: Empty state
- Select date range with no jobs
- Expected: "No completed jobs found" message

Test 16: Negative fine display
- If test data has negative fine
- Expected: Red text for negative values

- [ ] **Step 2: Document any issues found**

If any issues found during testing, fix them before proceeding.

- [ ] **Step 3: Final commit (if fixes were needed)**

```bash
git add .
git commit -m "fix(ledger): address integration test issues

[List any fixes made]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com)"
```

---

## Completion Checklist

After all tasks complete, verify:

- [ ] Backend `/api/ledger` endpoint responds to all formats (JSON, CSV, PDF)
- [ ] Date range filtering works correctly
- [ ] Column filtering works in exports
- [ ] Frontend auto-loads today's data on mount
- [ ] All three quick date buttons work
- [ ] Custom date range selection works
- [ ] Column visibility toggles work
- [ ] Table displays data correctly
- [ ] Totals row calculates correctly
- [ ] CSV downloads with correct format
- [ ] PDF downloads with correct format
- [ ] Validation prevents invalid operations
- [ ] Empty state handled gracefully
- [ ] Error states handled gracefully
- [ ] All code committed with proper messages

## Success Criteria

Feature is complete when:

1. ✅ User can view ledger for today (auto-loaded)
2. ✅ Quick date buttons work (Today, Yesterday, Last 7 Days)
3. ✅ Custom date range selection works
4. ✅ All 9 columns display correctly
5. ✅ Column visibility checkboxes work
6. ✅ Totals row shows correct sums
7. ✅ CSV download works with all columns
8. ✅ CSV download respects hidden columns
9. ✅ PDF download works with all columns
10. ✅ PDF download respects hidden columns
11. ✅ Empty state handled gracefully
12. ✅ Errors handled gracefully
13. ✅ Negative fines display correctly (red)
14. ✅ All weights displayed in grams

---

**End of Implementation Plan**
