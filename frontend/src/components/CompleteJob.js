// src/components/CompleteJob.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CompleteJob.css';

const CompleteJob = () => {
    // State variables
    const [searchQuery, setSearchQuery] = useState('');
    const [job, setJob] = useState(null);

    // Weight captures
    const [currentWeight, setCurrentWeight] = useState(0);
    const [javakVajanCaptures, setJavakVajanCaptures] = useState([]);
    const [isWeighing, setIsWeighing] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editWeight, setEditWeight] = useState('');

    // Other fields
    const [bagVajan, setBagVajan] = useState('');
    const [customerBagWeight, setCustomerBagWeight] = useState('');
    const [ghat, setGhat] = useState('');

    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const [loading, setLoading] = useState(false);
    const [printError, setPrintError] = useState(null);
    const [reprinting, setReprinting] = useState(false);

    const API_BASE = window.location.port === '3001'
        ? window.location.origin
        : `${window.location.protocol}//${window.location.hostname}:3001`;

    // Start weight polling and scan listener on component mount
    useEffect(() => {
        console.log('🚀 CompleteJob component loaded');
        startWeightPolling();

        const es = new EventSource(`${API_BASE}/api/scan/listen`);
        es.onmessage = async (e) => {
            try {
                const { job_number } = JSON.parse(e.data);
                setSearchQuery(job_number);
                setLoading(true);
                const response = await axios.get(`${API_BASE}/api/jobs/${job_number.toUpperCase()}`);
                setJob(response.data);
                showMessage(`Job ${response.data.job_number} loaded from scan`, 'success');
            } catch (err) {
                showMessage('Scan received but job not found', 'error');
            } finally {
                setLoading(false);
            }
        };
        return () => es.close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Poll weight from scale every 2 seconds
    const startWeightPolling = () => {
        const interval = setInterval(async () => {
            try {
                const response = await axios.get(`${API_BASE}/api/weight`);
                setCurrentWeight(response.data.weight);
            } catch (error) {
                console.error('Error reading weight:', error);
            }
        }, 2000);

        return () => clearInterval(interval);
    };

    // Show message to user
    const showMessage = (text, type = 'info') => {
        setMessage(text);
        setMessageType(type);
        setTimeout(() => {
            setMessage('');
            setMessageType('');
        }, 5000);
    };

    // Search for job by job number (accepts optional direct value from scanner)
    const handleSearch = async (directJobNumber) => {
        const query = directJobNumber || searchQuery;
        if (!query.trim()) {
            showMessage('Please enter a job number', 'warning');
            return;
        }

        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE}/api/jobs/${query.toUpperCase()}`);
            setJob(response.data);
            showMessage(`Job ${response.data.job_number} loaded successfully`, 'success');
        } catch (error) {
            console.error('Error searching for job:', error);
            if (error.response?.status === 404) {
                showMessage(`Job ${query.toUpperCase()} not found`, 'error');
            } else {
                showMessage('Error loading job. Please try again.', 'error');
            }
            setJob(null);
        } finally {
            setLoading(false);
        }
    };


    // Clear search and reset form
    const handleClearSearch = () => {
        setSearchQuery('');
        setJob(null);
        setJavakVajanCaptures([]);
        setBagVajan('');
        setCustomerBagWeight('');
        setGhat('');
        setMessage('');
        setPrintError(null);
    };

    // Handle keyboard shortcuts
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        } else if (e.key === 'Escape') {
            handleClearSearch();
        }
    };

    // Check if job is already completed
    const isJobCompleted = () => {
        return job && job.delivered_at !== null;
    };

    // Capture weight from scale
    const captureJavakVajan = () => {
        setIsWeighing(true);
        const capturedWeight = parseFloat(currentWeight.toFixed(1));
        setJavakVajanCaptures(prev => [...prev, capturedWeight]);
        console.log(`⚖️  Javak Vajan captured: ${capturedWeight}g`);

        setTimeout(() => setIsWeighing(false), 1000);
    };

    // Capture bag weight from scale
    const captureBagVajan = () => {
        const capturedWeight = parseFloat(currentWeight.toFixed(1));
        setBagVajan(capturedWeight.toString());
        showMessage(`Bag Vajan captured: ${capturedWeight}g`, 'success');
    };

    // Remove a captured Javak Vajan weight
    const removeJavakWeight = (index) => {
        setJavakVajanCaptures(prev => prev.filter((_, i) => i !== index));
        console.log(`🗑️  Removed Javak Vajan at index ${index}`);
    };

    // Start editing a Javak Vajan weight
    const startEditJavakWeight = (index) => {
        setEditingIndex(index);
        setEditWeight(javakVajanCaptures[index].toString());
    };

    // Save edited Javak Vajan weight
    const saveEditJavakWeight = () => {
        if (editWeight && parseFloat(editWeight) > 0) {
            setJavakVajanCaptures(prev => {
                const updated = [...prev];
                updated[editingIndex] = parseFloat(editWeight);
                return updated;
            });
        }
        setEditingIndex(null);
        setEditWeight('');
    };

    // Cancel editing
    const cancelEditJavakWeight = () => {
        setEditingIndex(null);
        setEditWeight('');
    };

    // Calculate total Javak Vajan (floor each weight, then sum)
    const getTotalJavakVajan = () => {
        return javakVajanCaptures.reduce((sum, weight) => sum + Math.floor(weight), 0);
    };

    // Calculate Fine: Javak - Aavak - Bag + Ghat (customer_bag_weight is informational only)
    const calculateFine = () => {
        if (!job || javakVajanCaptures.length === 0 || bagVajan === '') {
            return null;
        }

        const javak = getTotalJavakVajan();
        const aavak = parseFloat(job.initial_weight);
        const bag = parseFloat(bagVajan);
        const ghatVal = ghat === '' ? 0 : parseFloat(ghat);

        if (isNaN(bag)) {
            return null;
        }

        const fine = javak - aavak - bag + ghatVal;

        return {
            javak,
            aavak,
            bag,
            ghat: ghatVal,
            fine
        };
    };

    // Validate completion form
    const validateCompletion = () => {
        const errors = [];

        if (javakVajanCaptures.length === 0) {
            errors.push('At least one Javak Vajan capture is required');
        }

        if (bagVajan === '' || parseFloat(bagVajan) < 0 || isNaN(parseFloat(bagVajan))) {
            errors.push('Bag Vajan is required and cannot be negative');
        }

        // Ghat is optional, but if provided must be a valid number
        if (ghat !== '' && isNaN(parseFloat(ghat))) {
            errors.push('Ghat must be a valid number');
        }

        return errors;
    };

    // Download completion PDF receipt
    const downloadCompletionReceipt = async (jobNumber) => {
        try {
            console.log(`🖨️  Downloading completion PDF receipt for job: ${jobNumber}`);

            const response = await axios.get(`${API_BASE}/api/jobs/${jobNumber}/completion-receipt`, {
                responseType: 'blob'
            });

            // Create a blob URL and trigger download
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `completion-receipt-${jobNumber}.pdf`;
            document.body.appendChild(link);
            link.click();

            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);

            console.log(`✅ Completion PDF receipt downloaded for job: ${jobNumber}`);
        } catch (error) {
            console.error('❌ Error downloading completion receipt:', error);
            showMessage('Failed to download completion receipt. Job was completed successfully.', 'error');
        }
    };

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

    // Complete the job
    const handleCompleteJob = async () => {
        const errors = validateCompletion();

        if (errors.length > 0) {
            showMessage(errors.join('. '), 'error');
            return;
        }

        const calculations = calculateFine();

        setLoading(true);
        setPrintError(null);

        try {
            const response = await axios.put(
                `${API_BASE}/api/jobs/${job.job_number}/complete`,
                {
                    javak_vajan_captures: javakVajanCaptures,
                    bag_vajan: parseFloat(bagVajan),
                    customer_bag_weight: customerBagWeight === '' ? 0 : parseFloat(customerBagWeight),
                    ghat: ghat === '' ? 0 : parseFloat(ghat)
                }
            );

            // Update job state with completed data
            setJob(response.data.job);

            // Clear form
            setJavakVajanCaptures([]);
            setBagVajan('');
            setCustomerBagWeight('');
            setGhat('');

            // Show success message
            const successMsg = `Job ${job.job_number} completed successfully! Fine: ${calculations.fine}g`;
            showMessage(successMsg, 'success');

            setPrintError(response.data.printError || null);

            // Download completion PDF receipt
            await downloadCompletionReceipt(job.job_number);

        } catch (error) {
            if (error.response?.data?.error) {
                showMessage(error.response.data.error, 'error');
            } else {
                showMessage('Failed to complete job. Please try again.', 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="complete-job-container">
            <div className="header">
                <h1>🏭 Silver Ornament Polishing</h1>
                <h2>Complete Job & Delivery</h2>
            </div>

            {!job && !message && (
                <div className="info-banner">
                    <p>Enter a job number to begin the completion process.</p>
                    <p>This workflow captures final weights, calculates fine, and marks jobs as delivered.</p>
                </div>
            )}

            {message && (
                <div className={`message ${messageType}`}>
                    {message}
                </div>
            )}

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

            {/* Search Section */}
            <div className="search-section">
                <h3>Search Job by Number</h3>
                <div className="search-controls">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Enter Job Number (e.g., ABC0001)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                        onKeyDown={handleKeyPress}
                        disabled={loading}
                    />
                    <button
                        className="btn-primary"
                        onClick={() => handleSearch()}
                        disabled={loading}
                    >
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                    {job && (
                        <button
                            onClick={handleClearSearch}
                            className="btn-secondary"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Job Details Display */}
            {job && (
                <div className="job-details-section">
                    {/* Already Completed Warning */}
                    {isJobCompleted() && (
                        <div className="message warning">
                            This job was completed on {new Date(job.delivered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </div>
                    )}

                    {/* Customer Information */}
                    <div className="info-card">
                        <h3>Customer Information</h3>
                        <div className="summary-details">
                            <div className="summary-line">
                                <span>Name:</span>
                                <span><strong>{job.customer_name} ({job.customer_id})</strong></span>
                            </div>
                            <div className="summary-line">
                                <span>Phone:</span>
                                <span>{job.customer_phone}</span>
                            </div>
                            <div className="summary-line">
                                <span>Address:</span>
                                <span>{job.customer_address}</span>
                            </div>
                        </div>
                    </div>

                    {/* Job Information */}
                    <div className="info-card">
                        <h3>Job Details</h3>
                        <div className="summary-details">
                            <div className="summary-line">
                                <span>Job Number:</span>
                                <span><strong>{job.job_number}</strong></span>
                            </div>
                            <div className="summary-line">
                                <span>Aavak Vajan (Initial Weight):</span>
                                <span><strong>{Math.floor(job.initial_weight)} g</strong></span>
                            </div>
                            <div className="summary-line">
                                <span>Created:</span>
                                <span>{new Date(job.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                            </div>
                            <div className="summary-line">
                                <span>Status:</span>
                                <span><strong>{job.status}</strong></span>
                            </div>
                        </div>
                    </div>

                    {/* Completion Form - Only for uncompleted jobs */}
                    {!isJobCompleted() && (
                        <>
                            {/* Javak Vajan Section */}
                            <div className="weight-section">
                                <div className="weight-display">
                                    <h3>⚖️ Current Weight</h3>
                                    <div className="weight-value">{currentWeight.toFixed(1)} g</div>
                                    <button
                                        onClick={captureJavakVajan}
                                        className={`capture-btn ${isWeighing ? 'weighing' : ''}`}
                                        disabled={isWeighing}
                                    >
                                        {isWeighing ? '⏳ Capturing...' : '📸 Capture Javak Vajan'}
                                    </button>
                                </div>

                                {/* Captured Javak Vajan Weights List */}
                                {javakVajanCaptures.length > 0 && (
                                    <div className="weight-captures-list">
                                        <h4>Captured Javak Vajan:</h4>
                                        <ul>
                                            {javakVajanCaptures.map((weight, index) => (
                                                <li key={index}>
                                                    {editingIndex === index ? (
                                                        <div className="edit-weight">
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                value={editWeight}
                                                                onChange={(e) => setEditWeight(e.target.value)}
                                                                min="0"
                                            onKeyDown={(e) => (e.key === '.' || e.key === ',' || e.key === '-' || e.key === 'e' || e.key === 'E') && e.preventDefault()}
                                                                autoFocus
                                                            />
                                                            <button onClick={saveEditJavakWeight} className="btn-save">✓</button>
                                                            <button onClick={cancelEditJavakWeight} className="btn-cancel">✗</button>
                                                        </div>
                                                    ) : (
                                                        <div className="weight-item">
                                                            <span>{Math.floor(weight)} g</span>
                                                            <button onClick={() => startEditJavakWeight(index)} className="btn-edit">✏️</button>
                                                            <button onClick={() => removeJavakWeight(index)} className="btn-remove">🗑️</button>
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="total-weight">
                                            <strong>Total Javak Vajan: {getTotalJavakVajan()} g</strong>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Other Fields Section */}
                            <div className="info-card">
                                <h3>Other Measurements</h3>

                                {/* Bag Vajan */}
                                <div className="form-group">
                                    <label>Bag Vajan:</label>
                                    <div className="weight-input-group">
                                        <input
                                            type="number"
                                            step="1"
                                            value={bagVajan}
                                            onChange={(e) => setBagVajan(e.target.value)}
                                            min="0"
                                            onKeyDown={(e) => (e.key === '.' || e.key === ',' || e.key === '-' || e.key === 'e' || e.key === 'E') && e.preventDefault()}
                                            placeholder="0"
                                            className="weight-input"
                                        />
                                        <span className="unit">g</span>
                                        <button
                                            onClick={captureBagVajan}
                                            className="btn-secondary"
                                        >
                                            ⚖️ Capture from Scale
                                        </button>
                                    </div>
                                </div>

                                {/* Customer Bag Weight */}
                                <div className="form-group">
                                    <label>Customer Bag Weight:</label>
                                    <div className="weight-input-group">
                                        <input
                                            type="number"
                                            step="1"
                                            value={customerBagWeight}
                                            onChange={(e) => setCustomerBagWeight(e.target.value)}
                                            min="0"
                                            onKeyDown={(e) => (e.key === '.' || e.key === ',' || e.key === '-' || e.key === 'e' || e.key === 'E') && e.preventDefault()}
                                            placeholder="0"
                                            className="weight-input"
                                        />
                                        <span className="unit">g</span>
                                    </div>
                                </div>

                                {/* Ghat */}
                                <div className="form-group">
                                    <label>Ghat (optional):</label>
                                    <div className="weight-input-group">
                                        <input
                                            type="number"
                                            step="1"
                                            value={ghat}
                                            onChange={(e) => setGhat(e.target.value)}
                                            min="0"
                                            onKeyDown={(e) => (e.key === '.' || e.key === ',' || e.key === '-' || e.key === 'e' || e.key === 'E') && e.preventDefault()}
                                            placeholder="0"
                                            className="weight-input"
                                        />
                                        <span className="unit">g</span>
                                    </div>
                                </div>
                            </div>

                            {/* Live Fine Calculation Display */}
                            {(() => {
                                const calculations = calculateFine();
                                if (!calculations) return null;

                                return (
                                    <div className="info-card calculations-card">
                                        <h3>💰 Fine Calculation</h3>

                                        <div className="calculation-rows">
                                            <div className="calc-row">
                                                <span className="calc-label">Javak Vajan:</span>
                                                <span className="calc-value">{calculations.javak} g</span>
                                            </div>

                                            <div className="calc-row">
                                                <span className="calc-label">Aavak Vajan:</span>
                                                <span className="calc-value">{calculations.aavak} g</span>
                                            </div>

                                            <div className="calc-row">
                                                <span className="calc-label">Bag Vajan:</span>
                                                <span className="calc-value">{calculations.bag} g</span>
                                            </div>

                                            <div className="calc-row">
                                                <span className="calc-label">Ghat:</span>
                                                <span className="calc-value">{calculations.ghat} g</span>
                                            </div>

                                            <div className="calc-row highlight-row">
                                                <span className="calc-label">Fine:</span>
                                                <span className={`calc-value ${calculations.fine < 0 ? 'negative' : 'positive'}`}>
                                                    {calculations.fine} g
                                                </span>
                                            </div>
                                        </div>

                                        <div className="calc-formula">
                                            Formula: Javak - Aavak - Bag + Ghat
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Completion Button */}
                            {(() => {
                                const validationErrors = validateCompletion();

                                return (
                                    <div className="completion-actions">
                                        <button
                                            onClick={handleCompleteJob}
                                            disabled={loading || validationErrors.length > 0}
                                            className="btn-primary submit-btn"
                                        >
                                            {loading ? '⏳ Completing...' : '✅ Complete & Deliver'}
                                        </button>

                                        {validationErrors.length > 0 && (
                                            <div className="validation-errors">
                                                {validationErrors.map((error, idx) => (
                                                    <div key={idx} className="validation-error">• {error}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </>
                    )}

                    {/* Show final data if already completed */}
                    {isJobCompleted() && (
                        <div className="info-card completed-data">
                            <h3>✅ Completion Data</h3>
                            <div className="summary-details">
                                <div className="summary-line">
                                    <span>Javak Vajan (Final Weight):</span>
                                    <span><strong>{Math.floor(job.final_weight)} g</strong></span>
                                </div>
                                <div className="summary-line">
                                    <span>Bag Vajan:</span>
                                    <span>{Math.floor(job.plastic_bag_weight)} g</span>
                                </div>
                                <div className="summary-line">
                                    <span>Ghat:</span>
                                    <span>{Math.floor(job.ghat)} g</span>
                                </div>
                                <div className="summary-line">
                                    <span>Fine:</span>
                                    <span><strong>{Math.floor(job.fine_amount)} g</strong></span>
                                </div>
                                <div className="summary-line">
                                    <span>Customer Bag Weight:</span>
                                    <span>{Math.floor(job.customer_bag_weight || 0)} g</span>
                                </div>
                                <div className="summary-line">
                                    <span>Delivered:</span>
                                    <span>{new Date(job.delivered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CompleteJob;
