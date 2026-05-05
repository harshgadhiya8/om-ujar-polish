# Customer Monthly Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a customer-centric monthly ledger view with search, month selection, job table, and CSV/PDF downloads.

**Architecture:** New `/api/customer-ledger` endpoint with two modes (customer list + monthly detail), new `CustomerLedger` component as fourth tab, reuses CSV/PDF patterns from daily ledger.

**Tech Stack:** Node.js, Express, SQLite3, React 19, PDFKit

---

## File Structure

**Backend (new code in existing file):**
- Modify: `backend/server.js` - Add `/api/customer-ledger` endpoint, CSV generator, PDF generator

**Frontend (new files + modification):**
- Modify: `frontend/src/App.js` - Add fourth tab
- Create: `frontend/src/components/CustomerLedger.js` - Main component
- Create: `frontend/src/components/CustomerLedger.css` - Styles

---

### Task 1: Backend - Customer List API (Mode 1)

**Files:**
- Modify: `backend/server.js` (add endpoint around line 1320, after `/api/ledger` endpoint)

- [ ] **Step 1: Add customer list endpoint**

Add this code in `backend/server.js` after the `/api/ledger` endpoint (around line 1320):

```javascript
// ============================================================================
// CUSTOMER LEDGER API
// ============================================================================

app.get('/api/customer-ledger', (req, res) => {
    const { customer_id, month, format = 'json', view = 'detailed' } = req.query;

    // Mode 1: Customer List (no parameters)
    if (!customer_id && !month) {
        console.log('📊 Fetching customer list with job counts');

        const query = `
            SELECT
                c.customer_id,
                c.name,
                c.phone,
                COUNT(j.id) as total_jobs,
                SUM(CASE WHEN j.status = 'completed' THEN 1 ELSE 0 END) as completed_jobs
            FROM customers c
            LEFT JOIN jobs j ON c.customer_id = j.customer_id
            GROUP BY c.customer_id, c.name, c.phone
            ORDER BY c.name ASC
        `;

        db.all(query, [], (err, customers) => {
            if (err) {
                console.error('❌ Error fetching customers:', err);
                return res.status(500).json({ error: 'Failed to fetch customers' });
            }

            console.log(`✅ Found ${customers.length} customers`);
            res.json({ customers });
        });

        return;
    }

    // Mode 2 will be implemented in next task
    res.status(400).json({ error: 'Mode 2 not yet implemented' });
});
```

- [ ] **Step 2: Test customer list endpoint**

Run:
```bash
curl "http://localhost:3001/api/customer-ledger" | python3 -m json.tool
```

Expected output:
```json
{
  "customers": [
    {
      "customer_id": "ABC",
      "name": "Rajesh Kumar",
      "phone": "...",
      "total_jobs": 5,
      "completed_jobs": 3
    },
    ...
  ]
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/harsh/personal-project
git add backend/server.js
git commit -m "feat(api): add customer list endpoint for monthly ledger

Implement Mode 1 of /api/customer-ledger:
- Returns all customers with total and completed job counts
- Groups by customer, orders by name
- Foundation for customer-centric monthly view

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Backend - Customer Monthly Detail API (Mode 2)

**Files:**
- Modify: `backend/server.js` (replace the stub "Mode 2" section from Task 1)

- [ ] **Step 1: Add customer monthly detail logic**

Replace the stub `// Mode 2 will be implemented in next task` section with:

```javascript
    // Mode 2: Customer Monthly Detail
    // Validation
    if (customer_id && !month) {
        return res.status(400).json({ error: 'Month parameter required when customer_id is provided' });
    }

    if (!customer_id && month) {
        return res.status(400).json({ error: 'Customer ID parameter required when month is provided' });
    }

    // Validate month format (YYYY-MM)
    const monthPattern = /^\d{4}-\d{2}$/;
    if (!monthPattern.test(month)) {
        return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM (e.g., 2026-05)' });
    }

    // Validate month value (01-12)
    const monthNum = parseInt(month.split('-')[1]);
    if (monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: 'Invalid month. Must be between 01 and 12' });
    }

    // Validate format
    if (!['json', 'csv', 'pdf'].includes(format)) {
        return res.status(400).json({ error: 'Invalid format. Use json, csv, or pdf' });
    }

    // Validate view
    if (!['summary', 'detailed'].includes(view)) {
        return res.status(400).json({ error: 'Invalid view. Use summary or detailed' });
    }

    console.log(`📊 Fetching customer ledger: ${customer_id} for ${month}, format: ${format}, view: ${view}`);

    // Check if customer exists
    db.get('SELECT customer_id, name FROM customers WHERE customer_id = ?', [customer_id], (err, customer) => {
        if (err) {
            console.error('❌ Error checking customer:', err);
            return res.status(500).json({ error: 'Failed to fetch customer ledger' });
        }

        if (!customer) {
            return res.status(404).json({ error: `Customer ${customer_id} not found` });
        }

        // Fetch jobs for customer in the specified month
        const query = `
            SELECT
                j.job_number,
                j.delivered_at,
                j.customer_id,
                c.name as customer_name,
                j.initial_weight as aavak_vajan,
                j.final_weight as javak_vajan,
                j.plastic_bag_weight as bag_vajan,
                j.customer_bag_weight,
                j.ghat,
                j.fine_amount as fine
            FROM jobs j
            JOIN customers c ON j.customer_id = c.customer_id
            WHERE j.customer_id = ?
              AND j.status = 'completed'
              AND strftime('%Y-%m', j.delivered_at) = ?
            ORDER BY j.delivered_at DESC
        `;

        db.all(query, [customer_id, month], (err, jobs) => {
            if (err) {
                console.error('❌ Error fetching jobs:', err);
                return res.status(500).json({ error: 'Failed to fetch customer ledger' });
            }

            console.log(`✅ Found ${jobs.length} completed jobs for ${customer_id} in ${month}`);

            // Calculate totals
            const totals = {
                total_jobs: jobs.length,
                aavak_vajan: 0,
                javak_vajan: 0,
                bag_vajan: 0,
                customer_bag_weight: 0,
                ghat: 0,
                fine: 0
            };

            jobs.forEach(job => {
                totals.aavak_vajan += job.aavak_vajan || 0;
                totals.javak_vajan += job.javak_vajan || 0;
                totals.bag_vajan += job.bag_vajan || 0;
                totals.customer_bag_weight += job.customer_bag_weight || 0;
                totals.ghat += job.ghat || 0;
                totals.fine += job.fine || 0;
            });

            // Format month display (e.g., "2026-05" -> "May 2026")
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                'July', 'August', 'September', 'October', 'November', 'December'];
            const [year, monthStr] = month.split('-');
            const monthIndex = parseInt(monthStr) - 1;
            const monthDisplay = `${monthNames[monthIndex]} ${year}`;

            const customerData = {
                customer_id: customer.customer_id,
                customer_name: customer.name,
                month: month,
                month_display: monthDisplay,
                view: view
            };

            // Handle different formats
            if (format === 'csv') {
                generateCustomerLedgerCSV(customerData, jobs, totals, view, res);
            } else if (format === 'pdf') {
                generateCustomerLedgerPDF(customerData, jobs, totals, view, res);
            } else {
                // JSON response
                res.json({
                    ...customerData,
                    jobs,
                    totals
                });
            }
        });
    });
```

- [ ] **Step 2: Add stub functions for CSV and PDF**

Add these stub functions after the endpoint:

```javascript
// Customer Ledger CSV Generator (stub - implemented in Task 3)
function generateCustomerLedgerCSV(customerData, jobs, totals, view, res) {
    res.status(501).json({ error: 'CSV export not yet implemented' });
}

// Customer Ledger PDF Generator (stub - implemented in Task 4)
function generateCustomerLedgerPDF(customerData, jobs, totals, view, res) {
    res.status(501).json({ error: 'PDF export not yet implemented' });
}
```

- [ ] **Step 3: Test customer monthly detail endpoint (JSON)**

Run:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=ABC&month=2026-05" | python3 -m json.tool
```

Expected: JSON response with customer info, jobs array, totals object

- [ ] **Step 4: Test validation - invalid customer**

Run:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=INVALID&month=2026-05" | python3 -m json.tool
```

Expected:
```json
{
  "error": "Customer INVALID not found"
}
```

- [ ] **Step 5: Test validation - invalid month format**

Run:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=ABC&month=2026-13" | python3 -m json.tool
```

Expected:
```json
{
  "error": "Invalid month. Must be between 01 and 12"
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/harsh/personal-project
git add backend/server.js
git commit -m "feat(api): add customer monthly detail endpoint

Implement Mode 2 of /api/customer-ledger:
- Validates customer_id, month, format, view parameters
- Returns jobs for specific customer in specific month
- Calculates totals for all weight fields
- Formats month display (e.g., \"May 2026\")
- Stub functions for CSV and PDF exports

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Backend - CSV Export for Customer Ledger

**Files:**
- Modify: `backend/server.js` (replace the `generateCustomerLedgerCSV` stub)

- [ ] **Step 1: Implement CSV generator function**

Replace the `generateCustomerLedgerCSV` stub function with:

```javascript
// Customer Ledger CSV Generator
function generateCustomerLedgerCSV(customerData, jobs, totals, view, res) {
    try {
        console.log(`📄 Generating CSV ledger for ${customerData.customer_id}, ${customerData.month}, view: ${view}`);

        // UTF-8 BOM for Excel compatibility
        let csv = '\uFEFF';

        // Header section
        csv += 'Customer Monthly Ledger\r\n';
        csv += `Customer: ${customerData.customer_name} (${customerData.customer_id})\r\n`;
        csv += `Month: ${customerData.month_display}\r\n`;
        csv += '\r\n';

        // Column definitions based on view mode
        const columnDefs = {
            summary: [
                { key: 'job_number', header: 'Job Number' },
                { key: 'delivered_at', header: 'Date' },
                { key: 'aavak_vajan', header: 'Aavak Vajan (g)', isNumeric: true },
                { key: 'javak_vajan', header: 'Javak Vajan (g)', isNumeric: true },
                { key: 'fine', header: 'Fine (g)', isNumeric: true }
            ],
            detailed: [
                { key: 'delivered_at', header: 'Date' },
                { key: 'job_number', header: 'Job Number' },
                { key: 'customer_id', header: 'Customer ID' },
                { key: 'customer_name', header: 'Customer Name' },
                { key: 'aavak_vajan', header: 'Aavak Vajan (g)', isNumeric: true },
                { key: 'javak_vajan', header: 'Javak Vajan (g)', isNumeric: true },
                { key: 'bag_vajan', header: 'Bag Vajan (g)', isNumeric: true },
                { key: 'customer_bag_weight', header: 'Customer Bag Weight (g)', isNumeric: true },
                { key: 'ghat', header: 'Ghat (g)', isNumeric: true },
                { key: 'fine', header: 'Fine (g)', isNumeric: true }
            ]
        };

        const columns = columnDefs[view];

        // CSV escaping function (RFC 4180 + injection prevention)
        function escapeCSV(value) {
            if (value === null || value === undefined) {
                return '';
            }

            let str = String(value);

            // CSV injection prevention: prefix formulas with single quote
            if (str.match(/^[=+\-@]/)) {
                str = "'" + str;
            }

            // RFC 4180: escape if contains comma, quote, newline, or carriage return
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                // Escape double quotes by doubling them
                str = str.replace(/"/g, '""');
                // Wrap in double quotes
                return `"${str}"`;
            }

            return str;
        }

        // Format date for CSV (YYYY-MM-DD)
        function formatDateForCSV(isoString) {
            if (!isoString) return '';
            return isoString.split(' ')[0]; // Extract date part from "2026-05-05 14:30:00"
        }

        // Add column headers
        const headers = columns.map(col => escapeCSV(col.header));
        csv += headers.join(',') + '\r\n';

        // Add data rows
        jobs.forEach(job => {
            const row = columns.map(col => {
                let value = job[col.key];

                // Special formatting for date
                if (col.key === 'delivered_at') {
                    value = formatDateForCSV(value);
                }

                // Format numeric values
                if (col.isNumeric && value !== null && value !== undefined) {
                    value = Math.floor(value);
                }

                return escapeCSV(value);
            });

            csv += row.join(',') + '\r\n';
        });

        // Add totals row
        const totalsRow = columns.map((col, index) => {
            if (index === 0) {
                return escapeCSV('TOTAL');
            } else if (col.isNumeric) {
                const total = totals[col.key] || 0;
                return escapeCSV(Math.floor(total));
            } else {
                return '';
            }
        });

        csv += totalsRow.join(',') + '\r\n';

        // Generate filename
        const filename = `customer_ledger_${customerData.customer_id}_${customerData.month}.csv`;

        // Send CSV
        const buffer = Buffer.from(csv, 'utf-8');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);

        console.log(`✅ CSV ledger sent: ${filename}`);
    } catch (err) {
        console.error('❌ Error generating CSV:', err);
        res.status(500).json({ error: 'Failed to generate CSV ledger' });
    }
}
```

- [ ] **Step 2: Test CSV export with summary view**

Run:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=ABC&month=2026-05&format=csv&view=summary" --output /tmp/test_summary.csv
cat /tmp/test_summary.csv
```

Expected: CSV file with 5 columns (Job Number, Date, Aavak Vajan, Javak Vajan, Fine)

- [ ] **Step 3: Test CSV export with detailed view**

Run:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=ABC&month=2026-05&format=csv&view=detailed" --output /tmp/test_detailed.csv
cat /tmp/test_detailed.csv
```

Expected: CSV file with 10 columns (Date, Job Number, Customer ID, Customer Name, + all weights)

- [ ] **Step 4: Verify CSV escaping**

Open CSV in Excel or Numbers to verify:
- UTF-8 characters display correctly
- Customer names with commas are properly escaped
- No formula injection (values starting with = are prefixed with ')

- [ ] **Step 5: Commit**

```bash
cd /Users/harsh/personal-project
git add backend/server.js
git commit -m "feat(api): implement CSV export for customer ledger

Add generateCustomerLedgerCSV function:
- Supports summary (5 cols) and detailed (10 cols) views
- UTF-8 BOM for Excel compatibility
- RFC 4180 compliant escaping
- CSV injection prevention (prefix formulas with ')
- Date formatting (YYYY-MM-DD)
- Totals row with sums
- Filename format: customer_ledger_ABC_2026-05.csv

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Backend - PDF Export for Customer Ledger

**Files:**
- Modify: `backend/server.js` (replace the `generateCustomerLedgerPDF` stub)

- [ ] **Step 1: Implement PDF generator function**

Replace the `generateCustomerLedgerPDF` stub function with:

```javascript
// Customer Ledger PDF Generator
async function generateCustomerLedgerPDF(customerData, jobs, totals, view, res) {
    try {
        console.log(`📄 Generating PDF ledger for ${customerData.customer_id}, ${customerData.month}, view: ${view}`);

        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margin: 20
        });

        // Stream handling
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            const filename = `customer_ledger_${customerData.customer_id}_${customerData.month}.pdf`;

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);

            console.log(`✅ PDF ledger sent: ${filename}`);
        });

        doc.on('error', (err) => {
            console.error('❌ PDF generation error:', err);
            // Cannot send response here - stream already started
        });

        // Header section
        doc.fontSize(16).font('Helvetica-Bold');
        doc.text('Aum Polish', 0, 30, { align: 'center' });

        doc.fontSize(12).font('Helvetica');
        doc.text('Customer Monthly Ledger', 0, 50, { align: 'center' });

        doc.fontSize(10);
        doc.text(`Customer: ${customerData.customer_name} (${customerData.customer_id})`, 20, 80);
        doc.text(`Month: ${customerData.month_display}`, 20, 95);

        // Horizontal line
        doc.moveTo(20, 110).lineTo(822, 110).stroke();

        // Column definitions based on view mode
        const columnDefs = {
            summary: [
                { key: 'job_number', label: 'Job Number', width: 0.25, isNumeric: false },
                { key: 'delivered_at', label: 'Date', width: 0.15, isNumeric: false },
                { key: 'aavak_vajan', label: 'Aavak Vajan (g)', width: 0.20, isNumeric: true },
                { key: 'javak_vajan', label: 'Javak Vajan (g)', width: 0.20, isNumeric: true },
                { key: 'fine', label: 'Fine (g)', width: 0.20, isNumeric: true }
            ],
            detailed: [
                { key: 'delivered_at', label: 'Date', width: 0.08, isNumeric: false },
                { key: 'job_number', label: 'Job Number', width: 0.12, isNumeric: false },
                { key: 'customer_id', label: 'Customer ID', width: 0.08, isNumeric: false },
                { key: 'customer_name', label: 'Customer Name', width: 0.12, isNumeric: false },
                { key: 'aavak_vajan', label: 'Aavak Vajan (g)', width: 0.12, isNumeric: true },
                { key: 'javak_vajan', label: 'Javak Vajan (g)', width: 0.12, isNumeric: true },
                { key: 'bag_vajan', label: 'Bag Vajan (g)', width: 0.09, isNumeric: true },
                { key: 'customer_bag_weight', label: 'Cust Bag (g)', width: 0.09, isNumeric: true },
                { key: 'ghat', label: 'Ghat (g)', width: 0.09, isNumeric: true },
                { key: 'fine', label: 'Fine (g)', width: 0.09, isNumeric: true }
            ]
        };

        const columns = columnDefs[view];
        const tableWidth = 802; // A4 landscape width minus margins (842 - 40)
        const tableX = 20;
        let tableY = 120;

        // Format date for display
        function formatDateForPDF(isoString) {
            if (!isoString) return '';
            const date = new Date(isoString);
            return `${date.getMonth() + 1}/${date.getDate()}`;
        }

        // Draw table header
        function drawTableHeader(y) {
            let x = tableX;

            doc.font('Helvetica-Bold').fontSize(9);

            columns.forEach(col => {
                const colWidth = tableWidth * col.width;

                // Draw header cell background
                doc.rect(x, y, colWidth, 20).fillAndStroke('#007bff', '#000');

                // Draw header text
                doc.fillColor('#ffffff');
                const textAlign = col.isNumeric ? 'right' : 'left';
                const textX = col.isNumeric ? x + colWidth - 6 : x + 6;
                doc.text(col.label, textX, y + 6, {
                    width: colWidth - 12,
                    align: textAlign
                });

                x += colWidth;
            });

            doc.fillColor('#000000');
            return y + 20;
        }

        // Draw initial header
        tableY = drawTableHeader(tableY);

        // Draw data rows
        doc.font('Helvetica').fontSize(8);

        jobs.forEach((job, index) => {
            // Check if we need a new page
            if (tableY > 520) { // Leave space for footer
                doc.addPage();
                tableY = 30;
                tableY = drawTableHeader(tableY);
            }

            let x = tableX;

            // Alternating row background
            const bgColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
            doc.rect(tableX, tableY, tableWidth, 16).fillAndStroke(bgColor, '#ddd');

            doc.fillColor('#000000');

            columns.forEach(col => {
                const colWidth = tableWidth * col.width;
                let value = job[col.key];

                // Format value
                if (col.key === 'delivered_at') {
                    value = formatDateForPDF(value);
                } else if (col.isNumeric && value !== null && value !== undefined) {
                    value = Math.floor(value).toString();
                } else if (value === null || value === undefined) {
                    value = '';
                } else {
                    value = String(value);
                }

                // Draw cell text
                const textAlign = col.isNumeric ? 'right' : 'left';
                const textX = col.isNumeric ? x + colWidth - 6 : x + 6;

                doc.text(value, textX, tableY + 4, {
                    width: colWidth - 12,
                    align: textAlign,
                    ellipsis: true
                });

                x += colWidth;
            });

            tableY += 16;
        });

        // Draw totals row
        if (tableY > 520) {
            doc.addPage();
            tableY = 30;
            tableY = drawTableHeader(tableY);
        }

        let x = tableX;
        doc.rect(tableX, tableY, tableWidth, 18).fillAndStroke('#e9ecef', '#000');

        doc.font('Helvetica-Bold').fontSize(8);
        doc.fillColor('#000000');

        columns.forEach((col, index) => {
            const colWidth = tableWidth * col.width;
            let value = '';

            if (index === 0) {
                value = 'TOTAL';
            } else if (col.isNumeric) {
                const total = totals[col.key] || 0;
                value = Math.floor(total).toString();
            }

            const textAlign = col.isNumeric ? 'right' : 'left';
            const textX = col.isNumeric ? x + colWidth - 6 : x + 6;

            doc.text(value, textX, tableY + 5, {
                width: colWidth - 12,
                align: textAlign
            });

            x += colWidth;
        });

        tableY += 18;

        // Footer
        doc.moveTo(20, tableY + 10).lineTo(822, tableY + 10).stroke();

        doc.font('Helvetica').fontSize(8);
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istDate = new Date(now.getTime() + istOffset);
        const timestamp = istDate.toISOString().replace('T', ' ').substring(0, 19) + ' IST';

        doc.text(`Generated: ${timestamp}`, 0, tableY + 15, { align: 'center' });
        doc.text(`Total Jobs: ${totals.total_jobs}`, 0, tableY + 28, { align: 'center' });

        doc.end();
    } catch (err) {
        console.error('❌ Error generating PDF:', err);
        res.status(500).json({ error: 'Failed to generate PDF ledger' });
    }
}
```

- [ ] **Step 2: Test PDF export with summary view**

Run:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=ABC&month=2026-05&format=pdf&view=summary" --output /tmp/test_summary.pdf
open /tmp/test_summary.pdf
```

Expected: PDF with 5 columns, professional layout, totals row at bottom

- [ ] **Step 3: Test PDF export with detailed view**

Run:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=ABC&month=2026-05&format=pdf&view=detailed" --output /tmp/test_detailed.pdf
open /tmp/test_detailed.pdf
```

Expected: PDF with 10 columns, all data visible, proper alignment

- [ ] **Step 4: Verify PDF quality**

Check:
- Header shows customer name and month
- Table has borders and alternating row colors
- Numeric columns are right-aligned
- Totals row is bold with gray background
- Footer shows IST timestamp and job count

- [ ] **Step 5: Commit**

```bash
cd /Users/harsh/personal-project
git add backend/server.js
git commit -m "feat(api): implement PDF export for customer ledger

Add generateCustomerLedgerPDF function:
- Supports summary (5 cols) and detailed (10 cols) views
- A4 landscape layout with bordered table
- Header with customer info and month
- Alternating row backgrounds
- Numeric right-alignment
- Bold totals row with gray background
- Footer with IST timestamp and job count
- Pagination support with header repetition
- Filename format: customer_ledger_ABC_2026-05.pdf

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Frontend - Add Fourth Tab to App.js

**Files:**
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Add import for CustomerLedger component**

Add this import at the top of `App.js` (after CompleteJob import):

```javascript
import CustomerLedger from './components/CustomerLedger';
```

- [ ] **Step 2: Add fourth tab button**

Add this button after the "Daily Ledger" tab button (around line 34):

```javascript
        <button
          className={`tab-button ${activeTab === 'customer' ? 'active' : ''}`}
          onClick={() => setActiveTab('customer')}
        >
          👤 Customer Ledger
        </button>
```

- [ ] **Step 3: Add conditional render for CustomerLedger**

Add this line after the daily ledger conditional render (around line 42):

```javascript
        {activeTab === 'customer' && <CustomerLedger />}
```

- [ ] **Step 4: Verify frontend compiles**

Check browser console for errors. Expected: "Failed to compile" because CustomerLedger.js doesn't exist yet.

- [ ] **Step 5: Commit**

```bash
cd /Users/harsh/personal-project/frontend
git add src/App.js
git commit -m "feat(ui): add Customer Ledger tab to main app

Add fourth tab for customer-centric monthly ledger view:
- Import CustomerLedger component (not yet created)
- Add tab button with 👤 icon
- Add conditional render for customer tab
- Matches existing tab pattern

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Frontend - CustomerLedger Component Structure

**Files:**
- Create: `frontend/src/components/CustomerLedger.js`
- Create: `frontend/src/components/CustomerLedger.css`

- [ ] **Step 1: Create CustomerLedger.js component**

Create `frontend/src/components/CustomerLedger.js`:

```javascript
import React, { useState, useEffect } from 'react';
import './CustomerLedger.css';

const CustomerLedger = () => {
    // Helper function to get current month in YYYY-MM format
    const getTodayMonth = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    };

    // Helper function to get last month in YYYY-MM format
    const getLastMonth = () => {
        const today = new Date();
        let year = today.getFullYear();
        let month = today.getMonth(); // 0-11

        if (month === 0) {
            month = 12;
            year -= 1;
        }

        return `${year}-${String(month).padStart(2, '0')}`;
    };

    // State
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedYear, setSelectedYear] = useState('');
    const [ledgerData, setLedgerData] = useState(null);
    const [viewMode, setViewMode] = useState('detailed'); // 'summary' | 'detailed'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Column definitions
    const columnDefs = {
        summary: [
            { key: 'job_number', label: 'Job Number', isNumeric: false },
            { key: 'delivered_at', label: 'Date', isNumeric: false },
            { key: 'aavak_vajan', label: 'Aavak Vajan (g)', isNumeric: true },
            { key: 'javak_vajan', label: 'Javak Vajan (g)', isNumeric: true },
            { key: 'fine', label: 'Fine (g)', isNumeric: true }
        ],
        detailed: [
            { key: 'delivered_at', label: 'Date', isNumeric: false },
            { key: 'job_number', label: 'Job Number', isNumeric: false },
            { key: 'customer_id', label: 'Customer ID', isNumeric: false },
            { key: 'customer_name', label: 'Customer Name', isNumeric: false },
            { key: 'aavak_vajan', label: 'Aavak Vajan (g)', isNumeric: true },
            { key: 'javak_vajan', label: 'Javak Vajan (g)', isNumeric: true },
            { key: 'bag_vajan', label: 'Bag Vajan (g)', isNumeric: true },
            { key: 'customer_bag_weight', label: 'Customer Bag Weight (g)', isNumeric: true },
            { key: 'ghat', label: 'Ghat (g)', isNumeric: true },
            { key: 'fine', label: 'Fine (g)', isNumeric: true }
        ]
    };

    // Fetch all customers on mount
    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('http://localhost:3001/api/customer-ledger');

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch customers');
            }

            const data = await response.json();
            setCustomers(data.customers);
        } catch (err) {
            console.error('Error fetching customers:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Filter customers by search query
    const filteredCustomers = customers.filter(customer => {
        const query = searchQuery.toLowerCase();
        return customer.customer_id.toLowerCase().includes(query) ||
               customer.name.toLowerCase().includes(query);
    });

    // Format date for display (e.g., "2026-05-05 14:30:00" -> "5/5")
    const formatDateForDisplay = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    // Placeholder return - will be expanded in next tasks
    return (
        <div className="customer-ledger">
            <h2>Customer Ledger</h2>

            {loading && <p>Loading...</p>}
            {error && <p className="error">Error: {error}</p>}

            {!selectedCustomer && (
                <div className="customer-list">
                    <input
                        type="text"
                        placeholder="🔍 Search customers by name or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />

                    {filteredCustomers.length === 0 ? (
                        <p className="empty-state">
                            {searchQuery ? 'No customers match your search' : 'No customers found in the system'}
                        </p>
                    ) : (
                        <div className="customer-cards">
                            {filteredCustomers.map(customer => (
                                <div
                                    key={customer.customer_id}
                                    className="customer-card"
                                    onClick={() => setSelectedCustomer(customer)}
                                >
                                    <div className="customer-header">
                                        <strong>{customer.customer_id}</strong> - {customer.name}
                                    </div>
                                    <div className="customer-phone">📞 {customer.phone || 'No phone'}</div>
                                    <div className="customer-stats">
                                        Total: {customer.total_jobs} jobs | Completed: {customer.completed_jobs} jobs
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {selectedCustomer && !ledgerData && (
                <p>Month selection UI will be added in next task</p>
            )}

            {ledgerData && (
                <p>Job table will be added in later tasks</p>
            )}
        </div>
    );
};

export default CustomerLedger;
```

- [ ] **Step 2: Create CustomerLedger.css styles**

Create `frontend/src/components/CustomerLedger.css`:

```css
.customer-ledger {
    padding: 20px;
}

.customer-ledger h2 {
    margin-bottom: 20px;
    color: #333;
}

/* Search Input */
.search-input {
    width: 100%;
    max-width: 500px;
    padding: 12px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 5px;
    margin-bottom: 20px;
}

.search-input:focus {
    outline: none;
    border-color: #007bff;
}

/* Customer Cards */
.customer-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 15px;
    margin-top: 20px;
}

.customer-card {
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.2s;
}

.customer-card:hover {
    background: #e9ecef;
    border-color: #007bff;
    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.2);
}

.customer-header {
    font-size: 16px;
    margin-bottom: 8px;
    color: #333;
}

.customer-phone {
    font-size: 14px;
    color: #666;
    margin-bottom: 8px;
}

.customer-stats {
    font-size: 13px;
    color: #555;
}

/* Error and Empty States */
.error {
    color: #dc3545;
    padding: 10px;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
    margin-bottom: 15px;
}

.empty-state {
    text-align: center;
    padding: 40px;
    color: #6c757d;
    font-size: 16px;
}

/* Month Selection (will be styled in next task) */
.month-selection {
    background: #f5f5f5;
    padding: 20px;
    border-radius: 5px;
    margin-bottom: 20px;
}

/* Table (will be styled in later tasks) */
.ledger-table-container {
    overflow-x: auto;
    margin-top: 20px;
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
```

- [ ] **Step 3: Test component loads**

Open browser to http://localhost:3000, click "Customer Ledger" tab.

Expected: See customer list with search box, customer cards clickable

- [ ] **Step 4: Test search functionality**

Type "Rajesh" in search box.

Expected: Customer list filters to show only matching customers

- [ ] **Step 5: Test customer selection**

Click on a customer card.

Expected: Placeholder text "Month selection UI will be added in next task"

- [ ] **Step 6: Commit**

```bash
cd /Users/harsh/personal-project/frontend
git add src/components/CustomerLedger.js src/components/CustomerLedger.css
git commit -m "feat(ui): add CustomerLedger component structure

Create base component with:
- State management for customers, selection, month, ledger data
- Fetch all customers on mount
- Search filtering by name or ID
- Customer card grid with click to select
- Column definitions for summary/detailed views
- Helper functions for dates
- Placeholder UI for month selection and table

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Frontend - Customer Search and Selection

**Files:**
- Modify: `frontend/src/components/CustomerLedger.js`

- [ ] **Step 1: Add back button handler**

Add this function before the return statement (around line 97):

```javascript
    // Handle back to customer list
    const handleBackToList = () => {
        setSelectedCustomer(null);
        setLedgerData(null);
        setError(null);
    };
```

- [ ] **Step 2: Update month selection placeholder to show back button**

Replace the month selection placeholder section with:

```javascript
            {selectedCustomer && !ledgerData && (
                <div>
                    <button onClick={handleBackToList} className="back-button">
                        ← Back to customer list
                    </button>
                    <h3>Customer: {selectedCustomer.name} ({selectedCustomer.customer_id})</h3>
                    <p>Month selection UI will be added in next task</p>
                </div>
            )}
```

- [ ] **Step 3: Add back button styles to CSS**

Add these styles to `CustomerLedger.css`:

```css
/* Back Button */
.back-button {
    background: #6c757d;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    margin-bottom: 15px;
}

.back-button:hover {
    background: #5a6268;
}
```

- [ ] **Step 4: Test back button**

Open browser, click a customer card, then click "Back to customer list".

Expected: Returns to customer list view, customer deselected

- [ ] **Step 5: Test search persistence**

Search for "ABC", click ABC customer, click back, search should still show "ABC" filter.

Expected: Search query persists when navigating back

- [ ] **Step 6: Commit**

```bash
cd /Users/harsh/personal-project/frontend
git add src/components/CustomerLedger.js src/components/CustomerLedger.css
git commit -m "feat(ui): add back button for customer selection

Add navigation controls:
- Back button to return to customer list
- Clear selection and ledger data on back
- Display selected customer name and ID
- Styled back button with hover effect

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Frontend - Month Selection UI

**Files:**
- Modify: `frontend/src/components/CustomerLedger.js`
- Modify: `frontend/src/components/CustomerLedger.css`

- [ ] **Step 1: Add month selection handlers**

Add these functions before the return statement:

```javascript
    // Fetch ledger data for selected customer and month
    const fetchLedger = async (customer_id, month) => {
        setLoading(true);
        setError(null);

        try {
            const url = `http://localhost:3001/api/customer-ledger?customer_id=${customer_id}&month=${month}`;
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

    // Handle "This Month" button
    const handleThisMonth = () => {
        const month = getTodayMonth();
        const [year, monthNum] = month.split('-');
        setSelectedYear(year);
        setSelectedMonth(getMonthName(parseInt(monthNum)));
        fetchLedger(selectedCustomer.customer_id, month);
    };

    // Handle "Last Month" button
    const handleLastMonth = () => {
        const month = getLastMonth();
        const [year, monthNum] = month.split('-');
        setSelectedYear(year);
        setSelectedMonth(getMonthName(parseInt(monthNum)));
        fetchLedger(selectedCustomer.customer_id, month);
    };

    // Handle custom month selection
    const handleShowLedger = () => {
        if (!selectedMonth || !selectedYear) {
            setError('Please select both month and year');
            return;
        }

        const monthNum = getMonthNumber(selectedMonth);
        const month = `${selectedYear}-${String(monthNum).padStart(2, '0')}`;
        fetchLedger(selectedCustomer.customer_id, month);
    };

    // Helper: Get month name from number (1-12)
    const getMonthName = (monthNum) => {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
        return months[monthNum - 1];
    };

    // Helper: Get month number from name (1-12)
    const getMonthNumber = (monthName) => {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
        return months.indexOf(monthName) + 1;
    };
```

- [ ] **Step 2: Replace month selection placeholder with full UI**

Replace the month selection placeholder section with:

```javascript
            {selectedCustomer && !ledgerData && (
                <div>
                    <button onClick={handleBackToList} className="back-button">
                        ← Back to customer list
                    </button>
                    <h3>Customer: {selectedCustomer.name} ({selectedCustomer.customer_id})</h3>

                    <div className="month-selection">
                        <h4>📅 Select Month</h4>

                        {/* Quick buttons */}
                        <div className="quick-month-buttons">
                            <button onClick={handleThisMonth}>This Month</button>
                            <button onClick={handleLastMonth}>Last Month</button>
                        </div>

                        {/* Custom selection */}
                        <div className="custom-month-selection">
                            <label>Month:</label>
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                            >
                                <option value="">-- Select Month --</option>
                                <option value="January">January</option>
                                <option value="February">February</option>
                                <option value="March">March</option>
                                <option value="April">April</option>
                                <option value="May">May</option>
                                <option value="June">June</option>
                                <option value="July">July</option>
                                <option value="August">August</option>
                                <option value="September">September</option>
                                <option value="October">October</option>
                                <option value="November">November</option>
                                <option value="December">December</option>
                            </select>

                            <label>Year:</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                            >
                                <option value="">-- Select Year --</option>
                                <option value="2024">2024</option>
                                <option value="2025">2025</option>
                                <option value="2026">2026</option>
                            </select>

                            <button onClick={handleShowLedger}>Show Ledger</button>
                        </div>
                    </div>
                </div>
            )}
```

- [ ] **Step 3: Add month selection styles to CSS**

Add these styles to `CustomerLedger.css`:

```css
/* Month Selection */
.month-selection h4 {
    margin-top: 0;
    margin-bottom: 15px;
}

.quick-month-buttons {
    margin-bottom: 20px;
}

.quick-month-buttons button {
    margin-right: 10px;
    padding: 10px 20px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.quick-month-buttons button:hover {
    background: #0056b3;
}

.custom-month-selection {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.custom-month-selection label {
    font-weight: bold;
    font-size: 14px;
}

.custom-month-selection select {
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
}

.custom-month-selection select:focus {
    outline: none;
    border-color: #007bff;
}

.custom-month-selection button {
    padding: 8px 20px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.custom-month-selection button:hover {
    background: #218838;
}
```

- [ ] **Step 4: Test "This Month" button**

Open browser, select a customer, click "This Month".

Expected: Loading state, then "Job table will be added in later tasks" placeholder

- [ ] **Step 5: Test "Last Month" button**

Click "Back", select customer again, click "Last Month".

Expected: Fetches previous month's data (likely empty)

- [ ] **Step 6: Test custom month selection**

Click "Back", select customer, choose "May" and "2026", click "Show Ledger".

Expected: Fetches May 2026 data

- [ ] **Step 7: Test validation**

Click "Back", select customer, click "Show Ledger" without selecting month/year.

Expected: Error message "Please select both month and year"

- [ ] **Step 8: Commit**

```bash
cd /Users/harsh/personal-project/frontend
git add src/components/CustomerLedger.js src/components/CustomerLedger.css
git commit -m "feat(ui): add month selection functionality

Implement month selection UI:
- Quick buttons for This Month and Last Month
- Custom dropdowns for month and year (2024-2026)
- Validation for month/year selection
- fetchLedger function to call API
- Helper functions for month name/number conversion
- Styled month selection section

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Frontend - Job Table Display

**Files:**
- Modify: `frontend/src/components/CustomerLedger.js`

- [ ] **Step 1: Add view mode toggle and change month button handlers**

Add these functions before the return statement:

```javascript
    // Handle view mode toggle
    const handleViewModeChange = (mode) => {
        setViewMode(mode);
    };

    // Handle change month (go back to month selection)
    const handleChangeMonth = () => {
        setLedgerData(null);
    };
```

- [ ] **Step 2: Replace job table placeholder with full table UI**

Replace the section `{ledgerData && (<p>Job table will be added in later tasks</p>)}` with:

```javascript
            {ledgerData && (
                <div>
                    <div className="ledger-header">
                        <button onClick={handleBackToList} className="back-button">
                            ← Back
                        </button>
                        <button onClick={handleChangeMonth} className="back-button">
                            📅 Change Month
                        </button>
                    </div>

                    <h3>
                        Customer Ledger: {ledgerData.customer_name} ({ledgerData.customer_id}) - {ledgerData.month_display}
                    </h3>

                    {/* View Mode Toggle */}
                    <div className="view-mode-toggle">
                        <button
                            className={viewMode === 'summary' ? 'active' : ''}
                            onClick={() => handleViewModeChange('summary')}
                        >
                            Summary View
                        </button>
                        <button
                            className={viewMode === 'detailed' ? 'active' : ''}
                            onClick={() => handleViewModeChange('detailed')}
                        >
                            Detailed View
                        </button>
                    </div>

                    {/* Job Table */}
                    {ledgerData.jobs.length === 0 ? (
                        <div className="empty-state">
                            No completed jobs found for this customer in {ledgerData.month_display}
                        </div>
                    ) : (
                        <div className="ledger-table-container">
                            <table className="ledger-table">
                                <thead>
                                    <tr>
                                        {columnDefs[viewMode].map(col => (
                                            <th
                                                key={col.key}
                                                className={col.isNumeric ? 'numeric' : ''}
                                            >
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ledgerData.jobs.map((job, index) => (
                                        <tr key={index}>
                                            {columnDefs[viewMode].map(col => (
                                                <td
                                                    key={col.key}
                                                    className={`${col.isNumeric ? 'numeric' : ''} ${
                                                        col.isNumeric && job[col.key] < 0 ? 'negative' : ''
                                                    }`}
                                                >
                                                    {col.key === 'delivered_at'
                                                        ? formatDateForDisplay(job[col.key])
                                                        : col.isNumeric
                                                            ? Math.floor(job[col.key] || 0)
                                                            : job[col.key]
                                                    }
                                                </td>
                                            ))}
                                        </tr>
                                    ))}

                                    {/* Totals Row */}
                                    <tr className="totals-row">
                                        {columnDefs[viewMode].map((col, index) => (
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
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
```

- [ ] **Step 3: Add view mode toggle styles to CSS**

Add these styles to `CustomerLedger.css`:

```css
/* Ledger Header */
.ledger-header {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}

/* View Mode Toggle */
.view-mode-toggle {
    margin: 20px 0;
    display: flex;
    gap: 10px;
}

.view-mode-toggle button {
    padding: 10px 20px;
    background: #e9ecef;
    color: #333;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.view-mode-toggle button:hover {
    background: #d3d9df;
}

.view-mode-toggle button.active {
    background: #007bff;
    color: white;
    border-color: #007bff;
}
```

- [ ] **Step 4: Test table display with data**

Open browser, select customer with jobs, select month with jobs, click "This Month".

Expected: Table displays with all columns, job rows, totals row

- [ ] **Step 5: Test view mode toggle**

Click "Summary View" button.

Expected: Table shows only 5 columns (Job Number, Date, Aavak Vajan, Javak Vajan, Fine)

- [ ] **Step 6: Test "Detailed View" button**

Click "Detailed View" button.

Expected: Table shows all 10 columns

- [ ] **Step 7: Test "Change Month" button**

Click "📅 Change Month" button.

Expected: Returns to month selection view, table hidden

- [ ] **Step 8: Test empty state**

Select a customer and month with no completed jobs.

Expected: "No completed jobs found for this customer in [Month]" message

- [ ] **Step 9: Commit**

```bash
cd /Users/harsh/personal-project/frontend
git add src/components/CustomerLedger.js src/components/CustomerLedger.css
git commit -m "feat(ui): add job table display with view mode toggle

Implement complete table UI:
- View mode toggle (Summary vs Detailed)
- Table with dynamic columns based on view mode
- Job rows with proper data formatting
- Date formatting (M/D) for delivered_at
- Totals row with sums
- Empty state for no jobs
- Change Month button to return to selection
- Styled view mode toggle buttons

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Frontend - Download Functionality

**Files:**
- Modify: `frontend/src/components/CustomerLedger.js`
- Modify: `frontend/src/components/CustomerLedger.css`

- [ ] **Step 1: Add download handler functions**

Add these functions before the return statement:

```javascript
    // Download CSV
    const downloadCSV = () => {
        if (!ledgerData || ledgerData.jobs.length === 0) {
            return;
        }

        const url = `http://localhost:3001/api/customer-ledger?customer_id=${ledgerData.customer_id}&month=${ledgerData.month}&format=csv&view=${viewMode}`;
        window.location.href = url;
    };

    // Download PDF
    const downloadPDF = () => {
        if (!ledgerData || ledgerData.jobs.length === 0) {
            return;
        }

        const url = `http://localhost:3001/api/customer-ledger?customer_id=${ledgerData.customer_id}&month=${ledgerData.month}&format=pdf&view=${viewMode}`;
        window.location.href = url;
    };
```

- [ ] **Step 2: Add download buttons after table**

Add download buttons after the table (inside the `ledgerData.jobs.length === 0` else block, after the closing `</table>` tag):

```javascript
                            {/* Download Buttons */}
                            <div className="download-buttons">
                                <button onClick={downloadCSV}>Download CSV</button>
                                <button onClick={downloadPDF}>Download PDF</button>
                            </div>
```

- [ ] **Step 3: Add download button styles to CSS**

Add these styles to `CustomerLedger.css`:

```css
/* Download Buttons */
.download-buttons {
    display: flex;
    gap: 10px;
    margin-top: 20px;
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
```

- [ ] **Step 4: Test CSV download with summary view**

Open browser, select customer, select month, set view to "Summary", click "Download CSV".

Expected: CSV file downloads with 5 columns

- [ ] **Step 5: Test CSV download with detailed view**

Switch to "Detailed View", click "Download CSV".

Expected: CSV file downloads with 10 columns

- [ ] **Step 6: Verify CSV content**

Open downloaded CSV file.

Expected:
- Header with customer info and month
- Column headers matching view mode
- Data rows
- Totals row

- [ ] **Step 7: Test PDF download with summary view**

Set view to "Summary", click "Download PDF".

Expected: PDF downloads with 5 columns, professional layout

- [ ] **Step 8: Test PDF download with detailed view**

Switch to "Detailed View", click "Download PDF".

Expected: PDF downloads with 10 columns

- [ ] **Step 9: Verify PDF content**

Open downloaded PDF file.

Expected:
- Header with "Aum Polish", customer name, month
- Bordered table with proper alignment
- Totals row in gray
- Footer with timestamp and job count

- [ ] **Step 10: Commit**

```bash
cd /Users/harsh/personal-project/frontend
git add src/components/CustomerLedger.js src/components/CustomerLedger.css
git commit -m "feat(ui): add CSV and PDF download functionality

Implement download features:
- downloadCSV function with view mode support
- downloadPDF function with view mode support
- Download buttons below table
- Trigger downloads via URL navigation
- Respect current view mode (summary vs detailed)
- Styled download buttons

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Integration Testing & Polish

**Files:**
- Test entire feature end-to-end
- No file modifications

- [ ] **Step 1: Test complete happy path**

Manual test sequence:
1. Open app → Click "Customer Ledger" tab
2. See customer list
3. Search for "Rajesh"
4. Click customer card
5. Click "This Month"
6. See job table
7. Toggle "Summary View"
8. Toggle "Detailed View"
9. Download CSV
10. Download PDF
11. Click "Change Month"
12. Click "Last Month"
13. Click "Back"
14. Verify back at customer list

Expected: All steps work smoothly, no errors

- [ ] **Step 2: Test edge cases - empty results**

Test sequence:
1. Select customer
2. Select a month with no jobs (e.g., January 2024)
3. Verify empty state message
4. Verify download buttons not visible (or disabled)

- [ ] **Step 3: Test edge cases - search with no results**

Test sequence:
1. Search for "NONEXISTENT"
2. Verify "No customers match your search" message
3. Clear search
4. Verify customer list returns

- [ ] **Step 4: Test error handling - invalid customer**

Test backend validation:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=INVALID&month=2026-05" | python3 -m json.tool
```

Expected: 404 error with message "Customer INVALID not found"

- [ ] **Step 5: Test error handling - invalid month**

Test backend validation:
```bash
curl "http://localhost:3001/api/customer-ledger?customer_id=ABC&month=2026-13" | python3 -m json.tool
```

Expected: 400 error with message "Invalid month. Must be between 01 and 12"

- [ ] **Step 6: Test CSV format compliance**

Open CSV in Excel/Numbers and verify:
- UTF-8 characters display correctly
- Customer names with commas are properly escaped
- No formula injection
- Totals are correct

- [ ] **Step 7: Test PDF layout**

Open PDF and verify:
- Header shows customer name and month
- Table has borders
- Numeric columns are right-aligned
- Totals row is bold with gray background
- Footer shows IST timestamp and job count

- [ ] **Step 8: Test view mode persistence**

Test sequence:
1. Select customer, select month
2. Switch to "Summary View"
3. Download CSV
4. Verify CSV has only 5 columns
5. Switch to "Detailed View"
6. Download CSV again
7. Verify CSV has 10 columns

- [ ] **Step 9: Test rapid navigation**

Test sequence:
1. Quickly click through: customer list → select customer → This Month → Back → select different customer → Last Month
2. Verify no race conditions or stale data

- [ ] **Step 10: Verify console for errors**

Check browser console and server logs.

Expected: No errors, only info logs showing successful operations

- [ ] **Step 11: Final commit (if any polish needed)**

If you made any small fixes during testing, commit them:

```bash
cd /Users/harsh/personal-project
git add -A
git commit -m "test: complete integration testing for customer ledger

Verified complete flow:
- Customer list with search
- Month selection (quick buttons + custom)
- Job table with view mode toggle
- CSV and PDF downloads with correct formats
- Error handling and edge cases
- No console errors

Feature ready for production.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Implementation Complete

All tasks completed. The Customer Monthly Ledger feature is fully implemented with:

✅ Backend API endpoint with two modes (customer list + monthly detail)
✅ CSV and PDF exports with view mode support
✅ Frontend fourth tab with customer search
✅ Month selection (quick buttons + custom dropdowns)
✅ Job table with summary/detailed view toggle
✅ Download functionality
✅ Comprehensive error handling
✅ Integration testing

The feature matches all requirements from the design spec and is ready for production use.
