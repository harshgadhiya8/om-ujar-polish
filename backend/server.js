// server.js - Complete Backend for Silver Ornament Polishing System
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bwipjs = require('bwip-js');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Create Express application
const app = express();
const port = 3001;

// Middleware (these run before your routes)
app.use(cors()); // Allow frontend to connect
app.use(express.json()); // Parse JSON data from requests
app.use(express.static('public')); // Serve static files (for barcode images)

// Database connection
const dbPath = path.join(__dirname, '../om-ujar-palish');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('✅ Connected to SQLite database at:', dbPath);
        console.log('📊 Database ready for silver polishing operations!');

        // Run migrations after database opens
        runMigrations();
    }
});

// Serial port connection for weighing machine
let currentWeight = 0;
let scaleStatus = 'disconnected';
let reconnectTimer = null;

function connectScale() {
    const port = new SerialPort({ path: '/dev/cu.usbserial-140', baudRate: 9600 });

    port.on('error', (err) => {
        console.error('❌ Scale error:', err.message);
        if (port.isOpen) port.close();
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.on('open', () => {
        console.log('⚖️  Scale connected on /dev/cu.usbserial-140');
        scaleStatus = 'ready';
    });

    parser.on('data', (line) => {
        const match = line.match(/n[\/\\]w:\s*([\d.]+)\s*g/i);
        if (match) {
            currentWeight = parseFloat(match[1]);
        }
    });

    port.on('close', () => {
        console.log('⚠️  Scale disconnected');
        scaleStatus = 'disconnected';
        currentWeight = 0;
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            scalePort = connectScale();
        }, 5000);
    });

    return port;
}

let scalePort = connectScale();

// ============================================================================
// PRINTER FUNCTION
// ============================================================================

async function printReceipt(jobData, type) {
    if (!scalePort || !scalePort.isOpen) {
        throw new Error('Scale/printer not connected');
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
        if (line.length > WIDTH) {
            console.warn(`⚠️  Receipt row truncated: "${line}" (${line.length} > ${WIDTH} chars)`);
        }
        return line.slice(0, WIDTH);
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

// ============================================================================
// DATABASE MIGRATION
// ============================================================================

// Database migration function
function runMigrations() {
    console.log('🔧 Running database migrations...');

    db.serialize(() => {
        // Check current schema
        db.all("PRAGMA table_info(jobs)", (err, columns) => {
            if (err) {
                console.error('❌ Error checking table schema:', err);
                return;
            }

            const hasFineBasedCharge = columns.some(col => col.name === 'fine_based_charge');
            const hasWeightCaptures = columns.some(col => col.name === 'weight_captures');
            const hasJavakCaptures = columns.some(col => col.name === 'javak_vajan_captures');

            // Migration 1: Add fine_based_charge column
            if (!hasFineBasedCharge) {
                console.log('➕ Migration 1: Adding fine_based_charge column...');
                db.run(`ALTER TABLE jobs ADD COLUMN fine_based_charge REAL`, (err) => {
                    if (err) {
                        console.error('❌ Migration 1 failed:', err);
                    } else {
                        console.log('✅ Migration 1 complete');
                    }
                });
            }

            // Migration 2: Schema update for grams, IST, nullable fields, weight captures
            if (!hasWeightCaptures) {
                console.log('➕ Migration 2: Updating schema for grams, IST, and weight captures...');
                migrateToGramsAndIST();
            }

            // Migration 3: Add completion workflow fields
            if (!hasJavakCaptures && hasWeightCaptures) {
                console.log('➕ Migration 3: Adding completion workflow fields...');
                db.run(`ALTER TABLE jobs ADD COLUMN javak_vajan_captures TEXT`, (err) => {
                    if (err) {
                        console.error('❌ Failed to add javak_vajan_captures:', err);
                    } else {
                        console.log('✅ Added javak_vajan_captures column');
                    }
                });
                db.run(`ALTER TABLE jobs ADD COLUMN customer_bag_weight REAL DEFAULT 0`, (err) => {
                    if (err) {
                        console.error('❌ Failed to add customer_bag_weight:', err);
                    } else {
                        console.log('✅ Added customer_bag_weight column');
                    }
                });
                db.run(`ALTER TABLE jobs ADD COLUMN ghat REAL DEFAULT 0`, (err) => {
                    if (err) {
                        console.error('❌ Failed to add ghat:', err);
                    } else {
                        console.log('✅ Added ghat column');
                        console.log('✅ Migration 3 complete');
                    }
                });
            }

            // Migration 4: Create monthly sequences table for improved job numbering
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_monthly_sequences'", (err, row) => {
                if (err) {
                    console.error('❌ Error checking for monthly sequences table:', err);
                    return;
                }

                if (!row) {
                    console.log('➕ Migration 4: Creating monthly sequences table...');
                    db.run(`
                        CREATE TABLE customer_monthly_sequences (
                            customer_id TEXT NOT NULL,
                            month TEXT NOT NULL,
                            last_sequence INTEGER DEFAULT 0,
                            PRIMARY KEY (customer_id, month)
                        )
                    `, (err) => {
                        if (err) {
                            console.error('❌ Migration 4 failed:', err);
                        } else {
                            console.log('✅ Migration 4 complete: Monthly sequences table created');
                        }
                    });
                } else {
                    if (hasWeightCaptures && hasJavakCaptures) {
                        console.log('✅ Database schema up to date');
                    }
                }
            });
        });
    });
}

// Migration 2: Update jobs table to use grams, IST timezone, and add weight_captures
function migrateToGramsAndIST() {
    db.serialize(() => {
        // Step 1: Create new table with updated schema
        db.run(`
            CREATE TABLE jobs_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_number TEXT UNIQUE NOT NULL,
                customer_id TEXT NOT NULL,
                ornament_type_id INTEGER,
                initial_weight REAL NOT NULL,
                weight_captures TEXT,
                ghughri_option INTEGER DEFAULT 0,
                service_rate_per_kg REAL,
                service_charge REAL,
                status TEXT DEFAULT 'received',
                barcode TEXT UNIQUE NOT NULL,
                created_at TEXT DEFAULT (datetime('now', '+5:30')),
                updated_at TEXT DEFAULT (datetime('now', '+5:30')),

                -- Phase 2 & 3 fields
                final_weight REAL,
                plastic_bag_weight REAL DEFAULT 0,
                fine_amount REAL DEFAULT 0,
                fine_based_charge REAL,
                total_amount REAL,
                delivered_at TEXT
            )
        `, (err) => {
            if (err) {
                console.error('❌ Failed to create jobs_new table:', err);
                return;
            }

            // Step 2: Copy data from old table, converting kg to grams
            db.run(`
                INSERT INTO jobs_new (
                    id, job_number, customer_id, ornament_type_id,
                    initial_weight, weight_captures, ghughri_option,
                    service_rate_per_kg, service_charge, status, barcode,
                    created_at, updated_at,
                    final_weight, plastic_bag_weight, fine_amount,
                    fine_based_charge, total_amount, delivered_at
                )
                SELECT
                    id, job_number, customer_id, ornament_type_id,
                    initial_weight * 1000,
                    '[]',
                    ghughri_option,
                    service_rate_per_kg, service_charge, status, barcode,
                    datetime(created_at, '+5:30'),
                    datetime(updated_at, '+5:30'),
                    CASE WHEN final_weight IS NOT NULL THEN final_weight * 1000 ELSE NULL END,
                    CASE WHEN plastic_bag_weight IS NOT NULL THEN plastic_bag_weight * 1000 ELSE NULL END,
                    fine_amount,
                    fine_based_charge, total_amount, delivered_at
                FROM jobs
            `, (err) => {
                if (err) {
                    console.error('❌ Failed to migrate data:', err);
                    return;
                }

                // Step 3: Drop old table
                db.run(`DROP TABLE jobs`, (err) => {
                    if (err) {
                        console.error('❌ Failed to drop old table:', err);
                        return;
                    }

                    // Step 4: Rename new table
                    db.run(`ALTER TABLE jobs_new RENAME TO jobs`, (err) => {
                        if (err) {
                            console.error('❌ Failed to rename table:', err);
                        } else {
                            console.log('✅ Migration 2 complete: Schema updated to grams and IST');
                        }
                    });
                });
            });
        });
    });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Format decimal number with leading zeros (e.g., 1 → 00001, 123 → 00123)
function toDecimal5Digit(num) {
    return num.toString().padStart(5, '0');
}

// Generate next job number for a customer using monthly format: {CUSTOMER_ID}{YYMM}{#####}
// Example: ABC260500001 (Customer ABC, May 2026, sequence 00001)
// Supports 99,999 jobs per customer per month, sequence resets monthly
function generateJobNumber(customerId) {
    return new Promise((resolve, reject) => {
        console.log(`🎯 Generating job number for customer: ${customerId}`);

        // Get current month in YYMM format (e.g., "2605" for May 2026)
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istDate = new Date(now.getTime() + istOffset);
        const year = istDate.getUTCFullYear().toString().slice(-2); // Last 2 digits
        const month = (istDate.getUTCMonth() + 1).toString().padStart(2, '0');
        const yearMonth = year + month; // e.g., "2605"
        const fullMonth = istDate.getUTCFullYear() + '-' + month; // e.g., "2026-05" for storage

        // Get current sequence for this customer in this month
        db.get(
            'SELECT last_sequence FROM customer_monthly_sequences WHERE customer_id = ? AND month = ?',
            [customerId, fullMonth],
            (err, row) => {
                if (err) {
                    console.error('❌ Error reading sequence:', err);
                    reject(err);
                    return;
                }

                // Calculate next sequence number
                const currentSequence = row ? row.last_sequence : 0;
                const nextSequence = currentSequence + 1;

                // Check if we've exceeded the monthly limit
                if (nextSequence > 99999) {
                    console.error('❌ Monthly sequence limit exceeded (99,999 jobs)');
                    reject(new Error('Monthly job limit reached for customer ' + customerId));
                    return;
                }

                // Format: {CUSTOMER_ID}{YYMM}{#####}
                const decimalSequence = toDecimal5Digit(nextSequence);
                const jobNumber = `${customerId}${yearMonth}${decimalSequence}`;

                console.log(`📝 Month: ${fullMonth}, Sequence: ${currentSequence} → ${nextSequence}`);
                console.log(`🏷️  Job Number: ${jobNumber}`);

                // Update the sequence table
                db.run(
                    'INSERT OR REPLACE INTO customer_monthly_sequences (customer_id, month, last_sequence) VALUES (?, ?, ?)',
                    [customerId, fullMonth, nextSequence],
                    (updateErr) => {
                        if (updateErr) {
                            console.error('❌ Error updating sequence:', updateErr);
                            reject(updateErr);
                        } else {
                            console.log('✅ Sequence updated successfully');
                            resolve(jobNumber);
                        }
                    }
                );
            }
        );
    });
}

// Generate barcode as base64 string
async function generateBarcode(text) {
    try {
        console.log(`🔖 Generating barcode for: ${text}`);
        const png = await bwipjs.toBuffer({
            bcid: 'code128',       // Barcode type
            text: text,            // Text to encode
            scale: 3,              // Scale factor
            height: 10,            // Height in millimeters
            includetext: true,     // Include human-readable text
            textxalign: 'center'   // Center the text
        });
        console.log('✅ Barcode generated successfully');
        return png.toString('base64');
    } catch (err) {
        console.error('❌ Barcode generation failed:', err);
        throw new Error('Barcode generation failed: ' + err.message);
    }
}

// Get current timestamp for database
function getCurrentTimestamp() {
    return new Date().toISOString().replace('T', ' ').split('.')[0];
}

// Generate PDF receipt for a job (thermal printer format: 5.8cm x 7.5cm)
async function generateReceipt(jobData) {
    return new Promise((resolve, reject) => {
        try {
            // 5.8cm x 7.5cm = 165 x 213 points (at 72 DPI) - thermal receipt format
            const doc = new PDFDocument({
                size: [165, 213],
                margin: 5
            });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Get current date/time in IST
            // Add 5 hours 30 minutes to UTC to get IST
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
            const istDate = new Date(now.getTime() + istOffset);

            const dateStr = istDate.toLocaleDateString('en-IN', {
                timeZone: 'UTC',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const timeStr = istDate.toLocaleTimeString('en-IN', {
                timeZone: 'UTC',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            // Header row: "Aum Polish" (left) and Date/Time (right)
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Aum Polish', 5, 5, { width: 80, align: 'left' });
            doc.fontSize(7).font('Helvetica');
            doc.text(dateStr, 85, 5, { width: 75, align: 'right' });
            doc.text(timeStr, 85, 13, { width: 75, align: 'right' });

            // Horizontal line under header
            doc.moveTo(5, 23).lineTo(160, 23).stroke();

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

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

// Generate completion PDF receipt for a job (thermal printer format: 8cm x 10cm)
async function generateCompletionReceipt(jobData) {
    return new Promise((resolve, reject) => {
        try {
            // 8cm x 10cm = 227 x 283 points (at 72 DPI) - increased height for completion fields
            const doc = new PDFDocument({
                size: [227, 283],
                margin: 10
            });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Get current date/time in IST
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(now.getTime() + istOffset);

            const dateStr = istDate.toLocaleDateString('en-IN', {
                timeZone: 'UTC',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const timeStr = istDate.toLocaleTimeString('en-IN', {
                timeZone: 'UTC',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            // Header row: "Aum Polish" (left) and Date/Time (right)
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Aum Polish', 10, 10, { width: 100, align: 'left' });
            doc.fontSize(7).font('Helvetica');
            doc.text(dateStr, 120, 10, { width: 97, align: 'right' });
            doc.text(timeStr, 120, 18, { width: 97, align: 'right' });

            // Horizontal line under header
            doc.moveTo(10, 28).lineTo(217, 28).stroke();

            // Customer Name
            doc.moveDown(1.2);
            let currentY = doc.y;
            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Customer Name:', 10, currentY);
            doc.font('Helvetica');
            doc.text(`${jobData.customer_name} (${jobData.customer_id})`, 10, currentY, { width: 207, align: 'right' });
            doc.moveTo(10, currentY + 12).lineTo(217, currentY + 12).stroke();

            // Javak Vajan
            currentY += 18;
            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Javak Vajan:', 10, currentY);
            doc.font('Helvetica');
            doc.text(`${Math.floor(jobData.final_weight)} g`, 10, currentY, { width: 207, align: 'right' });
            doc.moveTo(10, currentY + 12).lineTo(217, currentY + 12).stroke();

            // Aavak Vajan
            currentY += 18;
            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Aavak Vajan:', 10, currentY);
            doc.font('Helvetica');
            doc.text(`${Math.floor(jobData.initial_weight)} g`, 10, currentY, { width: 207, align: 'right' });
            doc.moveTo(10, currentY + 12).lineTo(217, currentY + 12).stroke();

            // Bag Vajan
            currentY += 18;
            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Bag Vajan:', 10, currentY);
            doc.font('Helvetica');
            doc.text(`${Math.floor(jobData.plastic_bag_weight)} g`, 10, currentY, { width: 207, align: 'right' });
            doc.moveTo(10, currentY + 12).lineTo(217, currentY + 12).stroke();

            // Ghat
            currentY += 18;
            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Ghat:', 10, currentY);
            doc.font('Helvetica');
            doc.text(`${Math.floor(jobData.ghat)} g`, 10, currentY, { width: 207, align: 'right' });
            doc.moveTo(10, currentY + 12).lineTo(217, currentY + 12).stroke();

            // Fine
            currentY += 18;
            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Fine:', 10, currentY);
            doc.font('Helvetica');
            doc.text(`${Math.floor(jobData.fine_amount)} g`, 10, currentY, { width: 207, align: 'right' });
            doc.moveTo(10, currentY + 12).lineTo(217, currentY + 12).stroke();

            // Barcode section at bottom (shifted left)
            const bottomY = currentY + 20;

            if (jobData.barcode) {
                try {
                    const barcodeBuffer = Buffer.from(jobData.barcode, 'base64');
                    const barcodeWidth = 150;
                    const barcodeX = 20;
                    doc.image(barcodeBuffer, barcodeX, bottomY, {
                        fit: [barcodeWidth, 40]
                    });
                } catch (err) {
                    console.error('Error adding barcode to PDF:', err);
                }
            }

            // Customer Bag Weight — informational, bottom right, after barcode
            const bagLabelY = bottomY + 48;
            doc.fontSize(7).font('Helvetica-Bold');
            doc.text('Cust. Bag:', 10, bagLabelY, { width: 207, align: 'right' });
            doc.font('Helvetica');
            doc.text(`${Math.floor(jobData.customer_bag_weight || 0)} g`, 10, bagLabelY + 9, { width: 207, align: 'right' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

// ============================================================================
// API ROUTES
// ============================================================================

// Test route to verify server is working
app.get('/', (req, res) => {
    res.json({ 
        message: '🏭 Silver Ornament Polishing API Server',
        status: 'running',
        timestamp: getCurrentTimestamp(),
        database: 'connected'
    });
});

// Get all customers
app.get('/api/customers', (req, res) => {
    console.log('📋 Fetching all customers...');
    
    db.all('SELECT * FROM customers ORDER BY name', (err, rows) => {
        if (err) {
            console.error('❌ Error fetching customers:', err);
            res.status(500).json({ error: err.message });
        } else {
            console.log(`✅ Found ${rows.length} customers`);
            res.json(rows);
        }
    });
});

// Search customers by name
app.get('/api/customers/search', (req, res) => {
    const { query } = req.query;
    console.log(`🔍 Searching customers for: "${query}"`);
    
    if (!query || query.trim() === '') {
        return res.json([]);
    }
    
    db.all(
        'SELECT * FROM customers WHERE name LIKE ? OR customer_id LIKE ? ORDER BY name',
        [`%${query}%`, `%${query}%`],
        (err, rows) => {
            if (err) {
                console.error('❌ Error searching customers:', err);
                res.status(500).json({ error: err.message });
            } else {
                console.log(`✅ Found ${rows.length} matching customers`);
                res.json(rows);
            }
        }
    );
});

// Add new customer
app.post('/api/customers', (req, res) => {
    const { customer_id, name, phone, address } = req.body;
    console.log(`👤 Adding new customer: ${customer_id} - ${name}`);
    
    // Validation
    if (!customer_id || !name) {
        return res.status(400).json({ error: 'Customer ID and name are required' });
    }
    
    if (!/^[A-Z]{3}$/.test(customer_id)) {
        return res.status(400).json({ error: 'Customer ID must be exactly 3 uppercase letters' });
    }
    
    const timestamp = getCurrentTimestamp();
    
    // Start transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Insert customer
        db.run(
            'INSERT INTO customers (customer_id, name, phone, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [customer_id, name, phone || null, address || null, timestamp, timestamp],
            function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    if (err.message.includes('UNIQUE constraint failed')) {
                        console.error(`❌ Customer ID ${customer_id} already exists`);
                        res.status(400).json({ error: 'Customer ID already exists' });
                    } else {
                        console.error('❌ Error adding customer:', err);
                        res.status(500).json({ error: err.message });
                    }
                    return;
                }
                
                // Initialize sequence for new customer
                db.run(
                    'INSERT INTO customer_sequences (customer_id, last_sequence) VALUES (?, 0)',
                    [customer_id],
                    function(seqErr) {
                        if (seqErr) {
                            db.run('ROLLBACK');
                            console.error('❌ Error initializing sequence:', seqErr);
                            res.status(500).json({ error: seqErr.message });
                        } else {
                            db.run('COMMIT');
                            console.log(`✅ Customer ${customer_id} added and sequence initialized`);
                            res.json({ 
                                id: this.lastID, 
                                customer_id,
                                message: `Customer ${customer_id} added successfully!`
                            });
                        }
                    }
                );
            }
        );
    });
});

// Get all ornament types
app.get('/api/ornament-types', (req, res) => {
    console.log('🏺 Fetching ornament types...');
    
    db.all('SELECT * FROM ornament_types WHERE is_active = 1 ORDER BY name', (err, rows) => {
        if (err) {
            console.error('❌ Error fetching ornament types:', err);
            res.status(500).json({ error: err.message });
        } else {
            console.log(`✅ Found ${rows.length} ornament types`);
            res.json(rows);
        }
    });
});

// Create initial job/bill
app.post('/api/jobs/initial', async (req, res) => {
    try {
        const {
            customer_id,
            weight_captures
        } = req.body;

        console.log(`📝 Creating initial bill for customer: ${customer_id}`);
        console.log(`   Weight captures:`, weight_captures);

        // Validation
        if (!customer_id) {
            return res.status(400).json({ error: 'Customer ID is required' });
        }

        if (!weight_captures || !Array.isArray(weight_captures) || weight_captures.length === 0) {
            return res.status(400).json({ error: 'At least one weight capture is required' });
        }

        // Calculate total weight in grams (ignore decimal parts when summing)
        const totalWeight = weight_captures.reduce((sum, weight) => {
            return sum + Math.floor(parseFloat(weight));
        }, 0);

        console.log(`   Total weight (floored): ${totalWeight}g`);

        // Generate job number
        const jobNumber = await generateJobNumber(customer_id);

        // Generate barcode
        const barcodeBase64 = await generateBarcode(jobNumber);

        // Insert job into database (let DB handle timestamps with IST)
        db.run(
            `INSERT INTO jobs
            (job_number, customer_id, initial_weight, weight_captures, barcode)
            VALUES (?, ?, ?, ?, ?)`,
            [jobNumber, customer_id, totalWeight, JSON.stringify(weight_captures), barcodeBase64],
            function(err) {
                if (err) {
                    console.error('❌ Error creating job:', err);
                    res.status(500).json({ error: err.message });
                } else {
                    console.log(`✅ Job ${jobNumber} created successfully!`);
                    console.log(`   Total Weight: ${totalWeight}g`);

                    // Get complete job details with customer info
                    db.get(
                        `SELECT j.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
                         FROM jobs j
                         JOIN customers c ON j.customer_id = c.customer_id
                         WHERE j.id = ?`,
                        [this.lastID],
                        (err, row) => {
                            if (err) {
                                console.error('❌ Error fetching job details:', err);
                                res.status(500).json({ error: err.message });
                            } else {
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
                            }
                        }
                    );
                }
            }
        );
    } catch (error) {
        console.error('❌ Server error creating job:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get job by job number
app.get('/api/jobs/:jobNumber', (req, res) => {
    const { jobNumber } = req.params;
    console.log(`🔍 Looking up job: ${jobNumber}`);

    db.get(
        `SELECT j.*, c.name as customer_name, c.phone as customer_phone,
                c.address as customer_address
         FROM jobs j
         JOIN customers c ON j.customer_id = c.customer_id
         WHERE j.job_number = ?`,
        [jobNumber],
        (err, row) => {
            if (err) {
                console.error('❌ Error fetching job:', err);
                res.status(500).json({ error: err.message });
            } else if (!row) {
                console.log(`❌ Job ${jobNumber} not found`);
                res.status(404).json({ error: 'Job not found' });
            } else {
                console.log(`✅ Job ${jobNumber} found`);
                res.json(row);
            }
        }
    );
});

// Generate PDF receipt for a job
app.get('/api/jobs/:jobNumber/receipt', async (req, res) => {
    const { jobNumber } = req.params;
    console.log(`🖨️  Generating PDF receipt for job: ${jobNumber}`);

    db.get(
        `SELECT j.*, c.name as customer_name, c.phone as customer_phone,
                c.address as customer_address
         FROM jobs j
         JOIN customers c ON j.customer_id = c.customer_id
         WHERE j.job_number = ?`,
        [jobNumber],
        async (err, row) => {
            if (err) {
                console.error('❌ Error fetching job:', err);
                res.status(500).json({ error: err.message });
            } else if (!row) {
                console.log(`❌ Job ${jobNumber} not found`);
                res.status(404).json({ error: 'Job not found' });
            } else {
                try {
                    console.log(`✅ Generating PDF for job ${jobNumber}`);
                    const pdfBuffer = await generateReceipt(row);

                    // Set headers for PDF download
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="receipt-${jobNumber}.pdf"`);
                    res.setHeader('Content-Length', pdfBuffer.length);

                    res.send(pdfBuffer);
                    console.log(`✅ PDF receipt sent for job ${jobNumber}`);
                } catch (error) {
                    console.error('❌ Error generating PDF:', error);
                    res.status(500).json({ error: 'Failed to generate receipt PDF' });
                }
            }
        }
    );
});

// Generate completion PDF receipt for a job
app.get('/api/jobs/:jobNumber/completion-receipt', async (req, res) => {
    const { jobNumber } = req.params;
    console.log(`🖨️  Generating completion PDF receipt for job: ${jobNumber}`);

    db.get(
        `SELECT j.*, c.name as customer_name, c.phone as customer_phone,
                c.address as customer_address
         FROM jobs j
         JOIN customers c ON j.customer_id = c.customer_id
         WHERE j.job_number = ?`,
        [jobNumber],
        async (err, row) => {
            if (err) {
                console.error('❌ Error fetching job:', err);
                res.status(500).json({ error: err.message });
            } else if (!row) {
                console.log(`❌ Job ${jobNumber} not found`);
                res.status(404).json({ error: 'Job not found' });
            } else if (!row.delivered_at) {
                console.log(`❌ Job ${jobNumber} is not completed yet`);
                res.status(400).json({ error: 'Job is not completed yet' });
            } else {
                try {
                    console.log(`✅ Generating completion PDF for job ${jobNumber}`);
                    const pdfBuffer = await generateCompletionReceipt(row);

                    // Set headers for PDF download
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="completion-receipt-${jobNumber}.pdf"`);
                    res.setHeader('Content-Length', pdfBuffer.length);

                    res.send(pdfBuffer);
                    console.log(`✅ Completion PDF receipt sent for job ${jobNumber}`);
                } catch (error) {
                    console.error('❌ Error generating completion PDF:', error);
                    res.status(500).json({ error: 'Failed to generate completion receipt PDF' });
                }
            }
        }
    );
});

// Get all jobs with optional status filter
app.get('/api/jobs', (req, res) => {
    const { status } = req.query;
    console.log(`📋 Fetching jobs${status ? ` with status: ${status}` : ''}`);
    
    let query = `SELECT j.*, c.name as customer_name, ot.name as ornament_type_name
                 FROM jobs j
                 JOIN customers c ON j.customer_id = c.customer_id
                 JOIN ornament_types ot ON j.ornament_type_id = ot.id`;
    let params = [];
    
    if (status) {
        query += ' WHERE j.status = ?';
        params.push(status);
    }
    
    query += ' ORDER BY j.created_at DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('❌ Error fetching jobs:', err);
            res.status(500).json({ error: err.message });
        } else {
            console.log(`✅ Found ${rows.length} jobs`);
            res.json(rows);
        }
    });
});

// Complete a job (Phase 2/3: Final weights, fine calculation, delivery)
app.put('/api/jobs/:jobNumber/complete', (req, res) => {
    const { jobNumber } = req.params;
    let { javak_vajan_captures, bag_vajan, customer_bag_weight, ghat } = req.body;

    console.log(`📋 Completing job: ${jobNumber}`);

    // Validation
    if (!javak_vajan_captures || !Array.isArray(javak_vajan_captures) || javak_vajan_captures.length === 0) {
        return res.status(400).json({
            error: 'At least one Javak Vajan capture is required'
        });
    }

    if (bag_vajan === undefined || bag_vajan === null) {
        return res.status(400).json({ error: 'Bag Vajan is required' });
    }

    // customer_bag_weight is informational only, default to 0
    if (customer_bag_weight === undefined || customer_bag_weight === null) {
        customer_bag_weight = 0;
    }

    // Ghat is optional, default to 0 if not provided
    if (ghat === undefined || ghat === null) {
        ghat = 0;
    }

    // Calculate total Javak Vajan (floor each weight, then sum)
    const totalJavakVajan = javak_vajan_captures.reduce((sum, weight) => {
        return sum + Math.floor(parseFloat(weight));
    }, 0);

    const bagVajanNum = parseFloat(bag_vajan);
    const customerBagWeightNum = parseFloat(customer_bag_weight);
    const ghatNum = parseFloat(ghat);

    console.log(`📊 Completion Data:`);
    console.log(`  Javak Vajan (floored total): ${totalJavakVajan}g`);
    console.log(`  Bag Vajan: ${bagVajanNum}g`);
    console.log(`  Customer Bag Weight: ${customerBagWeightNum}g`);
    console.log(`  Ghat: ${ghatNum}g`);

    // Get job to check if it exists and get initial data
    db.get(
        `SELECT * FROM jobs WHERE job_number = ?`,
        [jobNumber],
        (err, job) => {
            if (err) {
                console.error('❌ Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!job) {
                return res.status(404).json({ error: `Job ${jobNumber} not found` });
            }

            if (job.delivered_at) {
                return res.status(400).json({
                    error: `Job ${jobNumber} was already completed on ${job.delivered_at}`
                });
            }

            // Calculate fine: Javak - Aavak - Bag + Ghat (customer_bag_weight is informational only)
            const aavakVajan = parseFloat(job.initial_weight);
            const fineAmount = totalJavakVajan - aavakVajan - bagVajanNum + ghatNum;

            console.log(`📊 Fine Calculation:`);
            console.log(`  Javak Vajan: ${totalJavakVajan}g`);
            console.log(`  Aavak Vajan: ${aavakVajan}g`);
            console.log(`  Bag Vajan: ${bagVajanNum}g`);
            console.log(`  Ghat: ${ghatNum}g`);
            console.log(`  Fine: ${fineAmount}g (${totalJavakVajan} - ${aavakVajan} - ${bagVajanNum} + ${ghatNum})`);

            // Calculate current IST timestamp
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(now.getTime() + istOffset);
            const istTimestamp = istDate.toISOString().replace('T', ' ').split('.')[0];

            // Update job with completion data
            db.run(
                `UPDATE jobs SET
                    javak_vajan_captures = ?,
                    final_weight = ?,
                    plastic_bag_weight = ?,
                    customer_bag_weight = ?,
                    ghat = ?,
                    fine_amount = ?,
                    status = 'completed',
                    delivered_at = ?,
                    updated_at = ?
                WHERE job_number = ?`,
                [
                    JSON.stringify(javak_vajan_captures),
                    totalJavakVajan,
                    bagVajanNum,
                    customerBagWeightNum,
                    ghatNum,
                    fineAmount,
                    istTimestamp,
                    istTimestamp,
                    jobNumber
                ],
                function(err) {
                    if (err) {
                        console.error('❌ Error updating job:', err);
                        return res.status(500).json({ error: 'Failed to complete job' });
                    }

                    // Fetch updated job with all data (no JOIN with ornament_types)
                    db.get(
                        `SELECT
                            j.*,
                            c.name as customer_name,
                            c.phone as customer_phone,
                            c.address as customer_address
                        FROM jobs j
                        JOIN customers c ON j.customer_id = c.customer_id
                        WHERE j.job_number = ?`,
                        [jobNumber],
                        (err, updatedJob) => {
                            if (err) {
                                console.error('❌ Error fetching updated job:', err);
                                return res.status(500).json({ error: 'Job completed but fetch failed' });
                            }

                            console.log(`✅ Job ${jobNumber} completed successfully`);
                            console.log(`   Fine: ${fineAmount}g`);

                            const response = {
                                success: true,
                                message: `Job ${jobNumber} completed successfully`,
                                job: updatedJob,
                                calculations: {
                                    javak_vajan: totalJavakVajan,
                                    aavak_vajan: aavakVajan,
                                    bag_vajan: bagVajanNum,
                                    customer_bag_weight: customerBagWeightNum,
                                    ghat: ghatNum,
                                    fine: fineAmount
                                }
                            };

                            printReceipt(updatedJob, 'completion')
                                .then(() => {
                                    console.log(`🖨️  Completion receipt printed for job ${jobNumber}`);
                                    res.json({ ...response, printError: null });
                                })
                                .catch((printErr) => {
                                    console.error('❌ Print error:', printErr.message);
                                    res.json({ ...response, printError: printErr.message });
                                });
                        }
                    );
                }
            );
        }
    );
});

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

// Weight endpoint - TEMPORARY mock until weighing machine cable is reconnected
app.get('/api/weight', (req, res) => {
    const mockWeight = parseFloat((Math.random() * 4900 + 100).toFixed(1));
    res.json({
        weight: mockWeight,
        status: 'ready',
        timestamp: getCurrentTimestamp()
    });
});

// Placeholder functions for CSV and PDF generation (implemented in Tasks 2-3)
// Generate CSV ledger export
function generateLedgerCSV(startDate, endDate, jobs, totals, columns, res) {
    try {
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
        let csv = '\uFEFF'; // UTF-8 BOM for Excel compatibility

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
                // Escape text fields (RFC 4180 + CSV injection prevention)
                if (typeof value === 'string') {
                    let escapedValue = value;
                    // Prevent CSV injection by prefixing formulas with single quote
                    if (escapedValue.match(/^[=+\-@]/)) {
                        escapedValue = "'" + escapedValue;
                    }
                    // Escape double quotes by doubling them, wrap in quotes if contains special chars
                    if (escapedValue.includes(',') || escapedValue.includes('"') || escapedValue.includes('\n') || escapedValue.includes('\r')) {
                        return `"${escapedValue.replace(/"/g, '""')}"`;
                    }
                    return escapedValue;
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
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8'));
        res.send(csv);

        console.log(`✅ CSV ledger sent: ${filename}`);
    } catch (err) {
        console.error('❌ Error generating CSV:', err);
        res.status(500).json({ error: 'Failed to generate CSV ledger' });
    }
}

// Helper function to format date for display
function formatDateForDisplay(isoDate) {
    const date = new Date(isoDate + 'T00:00:00Z'); // Parse as UTC to avoid timezone issues
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

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
            // Cannot send response here - stream already started
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

                // Redraw table headers on new page
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
                doc.font('Helvetica').fontSize(8); // Reset to data row font
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

// Preview next job number for a customer
app.get('/api/customers/:customerId/next-job-number', (req, res) => {
    const { customerId } = req.params;
    console.log(`🔮 Previewing next job number for: ${customerId}`);

    // Get current month in YYMM format
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istDate = new Date(now.getTime() + istOffset);
    const year = istDate.getUTCFullYear().toString().slice(-2);
    const month = (istDate.getUTCMonth() + 1).toString().padStart(2, '0');
    const yearMonth = year + month;
    const fullMonth = istDate.getUTCFullYear() + '-' + month;

    db.get(
        'SELECT last_sequence FROM customer_monthly_sequences WHERE customer_id = ? AND month = ?',
        [customerId, fullMonth],
        (err, row) => {
            if (err) {
                console.error('❌ Error reading sequence:', err);
                res.status(500).json({ error: err.message });
            } else {
                const currentSequence = row ? row.last_sequence : 0;
                const nextSequence = currentSequence + 1;
                const decimalSequence = toDecimal5Digit(nextSequence);
                const nextJobNumber = `${customerId}${yearMonth}${decimalSequence}`;

                console.log(`🔮 Next job number will be: ${nextJobNumber}`);
                res.json({ next_job_number: nextJobNumber });
            }
        }
    );
});

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
});

// Customer Ledger CSV Generator
function generateCustomerLedgerCSV(customerData, jobs, totals, view, res) {
    try {
        console.log(`📄 Generating CSV for ${customerData.customer_id} in ${customerData.month}, view: ${view}`);

        // UTF-8 BOM for Excel compatibility
        let csv = '\uFEFF';

        // Customer header section
        csv += 'Customer Monthly Ledger\r\n';
        csv += `Customer: ${customerData.customer_name} (${customerData.customer_id})\r\n`;
        csv += `Month: ${customerData.month_display}\r\n`;
        csv += '\r\n';

        // Define columns based on view
        let columns, headers;

        if (view === 'summary') {
            // Summary view: 5 columns
            columns = ['job_number', 'delivered_at', 'aavak_vajan', 'javak_vajan', 'fine'];
            headers = ['Job Number', 'Date', 'Aavak Vajan (g)', 'Javak Vajan (g)', 'Fine (g)'];
        } else {
            // Detailed view: 10 columns
            columns = [
                'delivered_at', 'job_number', 'customer_id', 'customer_name',
                'aavak_vajan', 'javak_vajan', 'bag_vajan', 'customer_bag_weight', 'ghat', 'fine'
            ];
            headers = [
                'Date', 'Job Number', 'Customer ID', 'Customer Name',
                'Aavak Vajan (g)', 'Javak Vajan (g)', 'Bag Vajan (g)', 'Customer Bag Weight (g)', 'Ghat (g)', 'Fine (g)'
            ];
        }

        // Write headers
        csv += headers.map(h => escapeCSVField(h)).join(',') + '\r\n';

        // Write data rows
        jobs.forEach(job => {
            const row = columns.map(col => {
                let value;

                switch (col) {
                    case 'delivered_at':
                        // Format date as YYYY-MM-DD
                        if (job.delivered_at) {
                            value = job.delivered_at.split(' ')[0]; // Take just the date part
                        } else {
                            value = '';
                        }
                        break;
                    case 'job_number':
                        value = job.job_number;
                        break;
                    case 'customer_id':
                        value = job.customer_id;
                        break;
                    case 'customer_name':
                        value = job.customer_name;
                        break;
                    case 'aavak_vajan':
                        value = job.aavak_vajan || 0;
                        break;
                    case 'javak_vajan':
                        value = job.javak_vajan || 0;
                        break;
                    case 'bag_vajan':
                        value = job.bag_vajan || 0;
                        break;
                    case 'customer_bag_weight':
                        value = job.customer_bag_weight || 0;
                        break;
                    case 'ghat':
                        value = job.ghat || 0;
                        break;
                    case 'fine':
                        value = job.fine || 0;
                        break;
                    default:
                        value = '';
                }

                return formatCSVValue(value, col);
            });
            csv += row.join(',') + '\r\n';
        });

        // Empty line before totals
        csv += '\r\n';

        // Totals row
        const totalsRow = columns.map((col, index) => {
            if (index === 0) {
                return 'TOTAL';
            }

            let totalValue;
            switch (col) {
                case 'delivered_at':
                    totalValue = '';
                    break;
                case 'job_number':
                    totalValue = '';
                    break;
                case 'customer_id':
                    totalValue = '';
                    break;
                case 'customer_name':
                    totalValue = '';
                    break;
                case 'aavak_vajan':
                    totalValue = totals.aavak_vajan || 0;
                    break;
                case 'javak_vajan':
                    totalValue = totals.javak_vajan || 0;
                    break;
                case 'bag_vajan':
                    totalValue = totals.bag_vajan || 0;
                    break;
                case 'customer_bag_weight':
                    totalValue = totals.customer_bag_weight || 0;
                    break;
                case 'ghat':
                    totalValue = totals.ghat || 0;
                    break;
                case 'fine':
                    totalValue = totals.fine || 0;
                    break;
                default:
                    totalValue = '';
            }

            return formatCSVValue(totalValue, col);
        });
        csv += totalsRow.join(',') + '\r\n';

        // Generate filename
        const filename = `customer_ledger_${customerData.customer_id}_${customerData.month}.csv`;

        // Send CSV file
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8'));
        res.send(csv);

        console.log(`✅ CSV generated: ${filename} (${view} view, ${jobs.length} jobs)`);
    } catch (err) {
        console.error('❌ Error generating CSV:', err);
        res.status(500).json({ error: 'Failed to generate CSV' });
    }
}

// Helper function to format CSV values
function formatCSVValue(value, fieldName) {
    // Handle null/undefined
    if (value === null || value === undefined) {
        return '0';
    }

    // String fields: escape and prevent CSV injection
    if (typeof value === 'string') {
        let escapedValue = value;

        // Prevent CSV injection by prefixing formulas with single quote
        if (escapedValue.match(/^[=+\-@]/)) {
            escapedValue = "'" + escapedValue;
        }

        // RFC 4180: Escape double quotes by doubling them, wrap in quotes if contains special chars
        if (escapedValue.includes(',') || escapedValue.includes('"') || escapedValue.includes('\n') || escapedValue.includes('\r')) {
            return `"${escapedValue.replace(/"/g, '""')}"`;
        }
        return escapedValue;
    }

    // Numeric fields: floor to remove decimals
    if (typeof value === 'number') {
        return Math.floor(value).toString();
    }

    return String(value);
}

// Helper function to escape CSV field
function escapeCSVField(field) {
    if (!field) return '';

    let escaped = String(field);

    // RFC 4180: Wrap in quotes if contains comma, quote, newline, or carriage return
    if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
        return `"${escaped.replace(/"/g, '""')}"`;
    }

    return escaped;
}

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

// ============================================================================
// MONTHLY ARCHIVE - EXCEL EXPORT
// ============================================================================

// Preview archive (GET) or Generate Excel files (POST)
app.all('/api/archive/monthly', async (req, res) => {
    try {
        const { month } = req.method === 'POST' ? req.body : req.query;
        const deleteAfterExport = req.method === 'POST' ? (req.body.deleteAfterExport === true) : false;

        console.log(`📦 Archive request for month: ${month}, delete: ${deleteAfterExport}`);

        // Validate month format (YYYY-MM)
        const monthPattern = /^\d{4}-\d{2}$/;
        if (!month || !monthPattern.test(month)) {
            return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM (e.g., 2026-04)' });
        }

        // GET: Preview only
        if (req.method === 'GET') {
            const preview = await getArchivePreview(month);
            return res.json(preview);
        }

        // POST: Generate Excel files
        const result = await generateMonthlyExcelArchive(month, deleteAfterExport);
        res.json(result);

    } catch (err) {
        console.error('❌ Archive error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get preview of what will be archived
async function getArchivePreview(month) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT
                c.customer_id,
                c.name as customer_name,
                COUNT(j.id) as job_count,
                SUM(j.initial_weight) as total_aavak,
                SUM(j.final_weight) as total_javak
            FROM jobs j
            JOIN customers c ON j.customer_id = c.customer_id
            WHERE j.status = 'completed'
              AND strftime('%Y-%m', j.delivered_at) = ?
            GROUP BY c.customer_id, c.name
            ORDER BY c.name ASC
        `;

        db.all(query, [month], (err, customers) => {
            if (err) {
                reject(err);
                return;
            }

            const totalJobs = customers.reduce((sum, c) => sum + c.job_count, 0);
            const totalCustomers = customers.length;

            resolve({
                month,
                month_display: formatMonthDisplay(month),
                total_customers: totalCustomers,
                total_jobs: totalJobs,
                customers: customers.map(c => ({
                    customer_id: c.customer_id,
                    customer_name: c.customer_name,
                    job_count: c.job_count,
                    total_aavak: Math.floor(c.total_aavak || 0),
                    total_javak: Math.floor(c.total_javak || 0)
                }))
            });
        });
    });
}

// Generate Excel files for each customer
async function generateMonthlyExcelArchive(month, deleteAfterExport) {
    // Create archive directory
    const archiveDir = path.join(__dirname, 'archives', month);
    if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
    }

    console.log(`📁 Archive directory: ${archiveDir}`);

    // Get all customers with completed jobs in this month
    const preview = await getArchivePreview(month);

    if (preview.total_customers === 0) {
        throw new Error(`No completed jobs found for ${month}`);
    }

    const generatedFiles = [];

    // Generate Excel file for each customer
    for (const customerInfo of preview.customers) {
        const filename = await generateCustomerExcel(month, customerInfo.customer_id, archiveDir);
        generatedFiles.push({
            customer_id: customerInfo.customer_id,
            customer_name: customerInfo.customer_name,
            filename: path.basename(filename),
            job_count: customerInfo.job_count
        });
    }

    // Optionally delete jobs after successful export
    if (deleteAfterExport) {
        await deleteArchivedJobs(month);
    }

    return {
        success: true,
        month,
        month_display: formatMonthDisplay(month),
        total_customers: preview.total_customers,
        total_jobs: preview.total_jobs,
        archive_path: archiveDir,
        files: generatedFiles,
        deleted: deleteAfterExport
    };
}

// Generate Excel file for a single customer
async function generateCustomerExcel(month, customerId, archiveDir) {
    return new Promise((resolve, reject) => {
        // Get customer info and jobs
        const customerQuery = `
            SELECT c.customer_id, c.name, c.phone, c.address
            FROM customers c
            WHERE c.customer_id = ?
        `;

        const jobsQuery = `
            SELECT
                j.job_number,
                j.delivered_at,
                j.initial_weight as aavak_vajan,
                j.final_weight as javak_vajan,
                j.plastic_bag_weight as bag_vajan,
                j.customer_bag_weight,
                j.ghat,
                j.fine_amount as fine,
                j.fine_based_charge,
                j.total_amount,
                j.status
            FROM jobs j
            WHERE j.customer_id = ?
              AND j.status = 'completed'
              AND strftime('%Y-%m', j.delivered_at) = ?
            ORDER BY j.delivered_at ASC
        `;

        db.get(customerQuery, [customerId], async (err, customer) => {
            if (err) {
                reject(err);
                return;
            }

            db.all(jobsQuery, [customerId, month], async (err, jobs) => {
                if (err) {
                    reject(err);
                    return;
                }

                try {
                    // Create Excel workbook
                    const workbook = new ExcelJS.Workbook();

                    // Sheet 1: Customer Info
                    const infoSheet = workbook.addWorksheet('Customer Info');
                    infoSheet.columns = [
                        { header: 'Field', key: 'field', width: 20 },
                        { header: 'Value', key: 'value', width: 40 }
                    ];

                    infoSheet.addRows([
                        { field: 'Customer ID', value: customer.customer_id },
                        { field: 'Name', value: customer.name },
                        { field: 'Phone', value: customer.phone || 'N/A' },
                        { field: 'Address', value: customer.address || 'N/A' },
                        { field: 'Month', value: formatMonthDisplay(month) },
                        { field: 'Total Jobs', value: jobs.length },
                        { field: 'Total Weight Processed (g)', value: Math.floor(jobs.reduce((sum, j) => sum + (j.aavak_vajan || 0), 0)) }
                    ]);

                    // Style header row
                    infoSheet.getRow(1).font = { bold: true };
                    infoSheet.getRow(1).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF4CAF50' }
                    };

                    // Sheet 2: Jobs Detail
                    const jobsSheet = workbook.addWorksheet('Jobs Detail');
                    jobsSheet.columns = [
                        { header: 'Job Number', key: 'job_number', width: 18 },
                        { header: 'Date', key: 'date', width: 12 },
                        { header: 'Aavak Vajan (g)', key: 'aavak_vajan', width: 15 },
                        { header: 'Javak Vajan (g)', key: 'javak_vajan', width: 15 },
                        { header: 'Bag Vajan (g)', key: 'bag_vajan', width: 14 },
                        { header: 'Customer Bag (g)', key: 'customer_bag', width: 16 },
                        { header: 'Ghat (g)', key: 'ghat', width: 10 },
                        { header: 'Fine (g)', key: 'fine', width: 10 },
                        { header: 'Status', key: 'status', width: 12 }
                    ];

                    // Add job rows
                    jobs.forEach(job => {
                        jobsSheet.addRow({
                            job_number: job.job_number,
                            date: job.delivered_at ? new Date(job.delivered_at).toLocaleDateString('en-IN') : '',
                            aavak_vajan: Math.floor(job.aavak_vajan || 0),
                            javak_vajan: Math.floor(job.javak_vajan || 0),
                            bag_vajan: Math.floor(job.bag_vajan || 0),
                            customer_bag: Math.floor(job.customer_bag_weight || 0),
                            ghat: Math.floor(job.ghat || 0),
                            fine: Math.floor(job.fine || 0),
                            status: job.status
                        });
                    });

                    // Add totals row
                    const totalsRow = jobsSheet.addRow({
                        job_number: 'TOTAL',
                        date: '',
                        aavak_vajan: Math.floor(jobs.reduce((sum, j) => sum + (j.aavak_vajan || 0), 0)),
                        javak_vajan: Math.floor(jobs.reduce((sum, j) => sum + (j.javak_vajan || 0), 0)),
                        bag_vajan: Math.floor(jobs.reduce((sum, j) => sum + (j.bag_vajan || 0), 0)),
                        customer_bag: Math.floor(jobs.reduce((sum, j) => sum + (j.customer_bag_weight || 0), 0)),
                        ghat: Math.floor(jobs.reduce((sum, j) => sum + (j.ghat || 0), 0)),
                        fine: Math.floor(jobs.reduce((sum, j) => sum + (j.fine || 0), 0)),
                        status: ''
                    });

                    // Style header row
                    jobsSheet.getRow(1).font = { bold: true };
                    jobsSheet.getRow(1).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF2196F3' }
                    };

                    // Style totals row
                    totalsRow.font = { bold: true };
                    totalsRow.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFFFEB3B' }
                    };

                    // Save file
                    const monthName = formatMonthDisplay(month).replace(' ', '-');
                    const filename = path.join(archiveDir, `${customer.customer_id}-${monthName}.xlsx`);

                    await workbook.xlsx.writeFile(filename);
                    console.log(`✅ Generated: ${path.basename(filename)}`);

                    resolve(filename);
                } catch (excelErr) {
                    reject(excelErr);
                }
            });
        });
    });
}

// Delete archived jobs
async function deleteArchivedJobs(month) {
    return new Promise((resolve, reject) => {
        const query = `
            DELETE FROM jobs
            WHERE status = 'completed'
              AND strftime('%Y-%m', delivered_at) = ?
        `;

        db.run(query, [month], function(err) {
            if (err) {
                reject(err);
                return;
            }
            console.log(`🗑️  Deleted ${this.changes} jobs from ${month}`);
            resolve(this.changes);
        });
    });
}

// Helper function to format month for display
function formatMonthDisplay(monthStr) {
    const [year, month] = monthStr.split('-');
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Start the server
app.listen(port, () => {
    console.log('🚀 ===============================================');
    console.log('🏭 Silver Ornament Polishing API Server');
    console.log('🚀 ===============================================');
    console.log(`🌐 Server running on: http://localhost:${port}`);
    console.log(`📊 Database: SQLite (${dbPath})`);
    console.log(`📋 API Documentation:`);
    console.log(`   GET  /                           - Server status`);
    console.log(`   GET  /api/customers              - List all customers`);
    console.log(`   POST /api/customers              - Add new customer`);
    console.log(`   GET  /api/ornament-types         - List ornament types`);
    console.log(`   POST /api/jobs/initial           - Create initial bill`);
    console.log(`   GET  /api/jobs                   - List all jobs`);
    console.log(`   GET  /api/jobs/:jobNumber        - Get job details`);
    console.log(`   PUT  /api/jobs/:jobNumber/complete - Complete job with final weights`);
    console.log(`   GET  /api/weight                 - Get current weight from scale`);
    console.log('🚀 ===============================================');
    console.log('✅ Ready to serve silver polishing requests!');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    if (reconnectTimer) clearTimeout(reconnectTimer);

    const closeDb = () => {
        db.close((err) => {
            if (err) {
                console.error('❌ Error closing database:', err.message);
            } else {
                console.log('✅ Database connection closed');
            }
            console.log('👋 Server stopped successfully');
            process.exit(0);
        });
    };

    if (scalePort && scalePort.isOpen) {
        scalePort.removeAllListeners('close');
        scalePort.close(() => {
            console.log('⚖️  Scale connection closed');
            closeDb();
        });
    } else {
        closeDb();
    }
});