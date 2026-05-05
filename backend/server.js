// server.js - Complete Backend for Silver Ornament Polishing System
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bwipjs = require('bwip-js');
const path = require('path');
const PDFDocument = require('pdfkit');

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

            if (hasWeightCaptures && hasJavakCaptures) {
                console.log('✅ Database schema up to date');
            }
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

// Base36 conversion for job numbers (supports 1.6M combinations per customer)
const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function toBase36(num) {
    if (num === 0) return '0000';
    let result = '';
    while (num > 0) {
        result = BASE36_CHARS[num % 36] + result;
        num = Math.floor(num / 36);
    }
    return result.padStart(4, '0'); // Always 4 characters: 0001, 000A, 0010
}

// Generate next job number for a customer
function generateJobNumber(customerId) {
    return new Promise((resolve, reject) => {
        console.log(`🎯 Generating job number for customer: ${customerId}`);
        
        // Get current sequence for this customer
        db.get(
            'SELECT last_sequence FROM customer_sequences WHERE customer_id = ?',
            [customerId],
            (err, row) => {
                if (err) {
                    console.error('❌ Error reading sequence:', err);
                    reject(err);
                    return;
                }

                // Calculate next sequence number
                const currentSequence = row ? row.last_sequence : 0;
                const nextSequence = currentSequence + 1;
                
                // Convert to Base36 format
                const base36Sequence = toBase36(nextSequence);
                const jobNumber = customerId + base36Sequence;

                console.log(`📝 Sequence: ${currentSequence} → ${nextSequence} → ${base36Sequence}`);
                console.log(`🏷️  Job Number: ${jobNumber}`);

                // Update the sequence table
                db.run(
                    'INSERT OR REPLACE INTO customer_sequences (customer_id, last_sequence) VALUES (?, ?)',
                    [customerId, nextSequence],
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

            // Customer Bag Weight
            currentY += 18;
            doc.fontSize(8).font('Helvetica-Bold');
            doc.text('Customer Bag Weight:', 10, currentY);
            doc.font('Helvetica');
            doc.text(`${Math.floor(jobData.customer_bag_weight)} g`, 10, currentY, { width: 207, align: 'right' });
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
                                res.json({
                                    success: true,
                                    job: row,
                                    message: `Job ${jobNumber} created successfully!`
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

    if (customer_bag_weight === undefined || customer_bag_weight === null) {
        return res.status(400).json({ error: 'Customer Bag Weight is required' });
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

            // Calculate fine: Javak - Aavak - Bag - Customer_Bag + Ghat
            const aavakVajan = parseFloat(job.initial_weight);
            const fineAmount = totalJavakVajan - aavakVajan - bagVajanNum - customerBagWeightNum + ghatNum;

            console.log(`📊 Fine Calculation:`);
            console.log(`  Javak Vajan: ${totalJavakVajan}g`);
            console.log(`  Aavak Vajan: ${aavakVajan}g`);
            console.log(`  Bag Vajan: ${bagVajanNum}g`);
            console.log(`  Customer Bag Weight: ${customerBagWeightNum}g`);
            console.log(`  Ghat: ${ghatNum}g`);
            console.log(`  Fine: ${fineAmount}g (${totalJavakVajan} - ${aavakVajan} - ${bagVajanNum} - ${customerBagWeightNum} + ${ghatNum})`);

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

                            res.json(response);
                        }
                    );
                }
            );
        }
    );
});

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
    
    db.get(
        'SELECT last_sequence FROM customer_sequences WHERE customer_id = ?',
        [customerId],
        (err, row) => {
            if (err) {
                console.error('❌ Error reading sequence:', err);
                res.status(500).json({ error: err.message });
            } else {
                const currentSequence = row ? row.last_sequence : 0;
                const nextSequence = currentSequence + 1;
                const base36Sequence = toBase36(nextSequence);
                const nextJobNumber = customerId + base36Sequence;
                
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

    // Mode 2 will be implemented in next task
    res.status(400).json({ error: 'Mode 2 not yet implemented' });
});

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
    console.log(`   GET  /api/weight                 - Get current weight (mock)`);
    console.log('🚀 ===============================================');
    console.log('✅ Ready to serve silver polishing requests!');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
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