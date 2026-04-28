// server.js - Complete Backend for Silver Ornament Polishing System
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bwipjs = require('bwip-js');
const path = require('path');

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

// Database migration: Add fine_based_charge column if it doesn't exist
function runMigrations() {
    console.log('🔧 Running database migrations...');

    db.serialize(() => {
        // Check if fine_based_charge column exists
        db.all("PRAGMA table_info(jobs)", (err, columns) => {
            if (err) {
                console.error('❌ Error checking table schema:', err);
                return;
            }

            const hasFineBasedCharge = columns.some(col => col.name === 'fine_based_charge');

            if (!hasFineBasedCharge) {
                console.log('➕ Adding fine_based_charge column to jobs table...');
                db.run(`ALTER TABLE jobs ADD COLUMN fine_based_charge REAL`, (err) => {
                    if (err) {
                        console.error('❌ Migration failed:', err);
                    } else {
                        console.log('✅ Migration complete: fine_based_charge column added');
                    }
                });
            } else {
                console.log('✅ Database schema up to date');
            }
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
            ornament_type_id, 
            initial_weight, 
            ghughri_option, 
            service_rate_per_kg 
        } = req.body;

        console.log(`📝 Creating initial bill for customer: ${customer_id}`);
        console.log(`   Weight: ${initial_weight}kg, Rate: ₹${service_rate_per_kg}/kg`);

        // Validation
        if (!customer_id || !ornament_type_id || !initial_weight || ghughri_option === undefined || !service_rate_per_kg) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (![0, 1].includes(parseInt(ghughri_option))) {
            return res.status(400).json({ error: 'Ghughri option must be 0 (without) or 1 (with)' });
        }

        // Generate job number
        const jobNumber = await generateJobNumber(customer_id);
        
        // Calculate service charge
        const serviceCharge = parseFloat(initial_weight) * parseFloat(service_rate_per_kg);
        
        // Generate barcode
        const barcodeBase64 = await generateBarcode(jobNumber);
        
        const timestamp = getCurrentTimestamp();

        // Insert job into database
        db.run(
            `INSERT INTO jobs 
            (job_number, customer_id, ornament_type_id, initial_weight, ghughri_option, 
             service_rate_per_kg, service_charge, barcode, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [jobNumber, customer_id, parseInt(ornament_type_id), parseFloat(initial_weight), 
             parseInt(ghughri_option), parseFloat(service_rate_per_kg), serviceCharge, 
             barcodeBase64, timestamp, timestamp],
            function(err) {
                if (err) {
                    console.error('❌ Error creating job:', err);
                    res.status(500).json({ error: err.message });
                } else {
                    console.log(`✅ Job ${jobNumber} created successfully!`);
                    console.log(`   Service Charge: ₹${serviceCharge.toFixed(2)}`);
                    
                    // Get complete job details with customer and ornament info
                    db.get(
                        `SELECT j.*, c.name as customer_name, c.phone as customer_phone,
                                ot.name as ornament_type_name
                         FROM jobs j
                         JOIN customers c ON j.customer_id = c.customer_id
                         JOIN ornament_types ot ON j.ornament_type_id = ot.id
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
                ot.name as ornament_type_name
         FROM jobs j
         JOIN customers c ON j.customer_id = c.customer_id
         JOIN ornament_types ot ON j.ornament_type_id = ot.id
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
    const { final_weight, plastic_bag_weight } = req.body;

    console.log(`📋 Completing job: ${jobNumber}`);
    console.log(`Final weight: ${final_weight}kg, Bag weight: ${plastic_bag_weight}kg`);

    // Validation
    if (!final_weight || plastic_bag_weight === undefined) {
        return res.status(400).json({
            error: 'Both final_weight and plastic_bag_weight are required'
        });
    }

    const finalWeightNum = parseFloat(final_weight);
    const bagWeightNum = parseFloat(plastic_bag_weight);

    if (isNaN(finalWeightNum) || finalWeightNum <= 0) {
        return res.status(400).json({ error: 'Invalid final weight' });
    }

    if (isNaN(bagWeightNum) || bagWeightNum < 0) {
        return res.status(400).json({ error: 'Invalid plastic bag weight' });
    }

    if (finalWeightNum <= bagWeightNum) {
        return res.status(400).json({
            error: 'Final weight must be greater than plastic bag weight'
        });
    }

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

            // Calculate fine and charges
            const actualOrnamentWeight = finalWeightNum - bagWeightNum;
            const fineAmount = actualOrnamentWeight - parseFloat(job.initial_weight);
            const fineBasedCharge = fineAmount * parseFloat(job.service_rate_per_kg);

            console.log(`📊 Calculations:`);
            console.log(`  Actual ornament weight: ${actualOrnamentWeight.toFixed(3)}kg`);
            console.log(`  Fine (added silver): ${fineAmount.toFixed(3)}kg`);
            console.log(`  Fine based charge: ₹${fineBasedCharge.toFixed(2)}`);

            const warning = fineAmount < 0
                ? `Warning: Silver lost during polishing: ${Math.abs(fineAmount * 1000).toFixed(0)}g`
                : null;

            if (warning) {
                console.log(`⚠️  ${warning}`);
            }

            // Update job with completion data
            db.run(
                `UPDATE jobs SET
                    final_weight = ?,
                    plastic_bag_weight = ?,
                    fine_amount = ?,
                    fine_based_charge = ?,
                    status = 'completed',
                    delivered_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE job_number = ?`,
                [finalWeightNum, bagWeightNum, fineAmount, fineBasedCharge, jobNumber],
                function(err) {
                    if (err) {
                        console.error('❌ Error updating job:', err);
                        return res.status(500).json({ error: 'Failed to complete job' });
                    }

                    // Fetch updated job with all data
                    db.get(
                        `SELECT
                            j.*,
                            c.name as customer_name,
                            c.phone as customer_phone,
                            c.address as customer_address,
                            ot.name as ornament_type_name
                        FROM jobs j
                        JOIN customers c ON j.customer_id = c.customer_id
                        JOIN ornament_types ot ON j.ornament_type_id = ot.id
                        WHERE j.job_number = ?`,
                        [jobNumber],
                        (err, updatedJob) => {
                            if (err) {
                                console.error('❌ Error fetching updated job:', err);
                                return res.status(500).json({ error: 'Job completed but fetch failed' });
                            }

                            console.log(`✅ Job ${jobNumber} completed successfully`);

                            const response = {
                                success: true,
                                message: `Job ${jobNumber} completed successfully`,
                                job: updatedJob,
                                calculations: {
                                    actual_ornament_weight: actualOrnamentWeight,
                                    fine_amount: fineAmount,
                                    fine_based_charge: fineBasedCharge,
                                    service_charge: parseFloat(job.service_charge)
                                }
                            };

                            if (warning) {
                                response.warning = warning;
                            }

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
    // Simulate random weight for testing
    const mockWeight = (Math.random() * 0.5 + 0.1).toFixed(3);
    console.log(`⚖️  Mock weight reading: ${mockWeight}kg`);

    res.json({
        weight: parseFloat(mockWeight),
        status: 'ready',
        timestamp: getCurrentTimestamp()
    });
});

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