// src/components/InitialBill.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './InitialBill.css';

const InitialBill = () => {
    // State variables (these store data that can change)
    const [customers, setCustomers] = useState([]); // List of all customers
    const [selectedCustomer, setSelectedCustomer] = useState(''); // Currently selected customer
    const [currentWeight, setCurrentWeight] = useState(0); // Weight from scale (in grams)
    const [weightCaptures, setWeightCaptures] = useState([]); // Array of captured weights
    const [isWeighing, setIsWeighing] = useState(false); // Weight capture animation
    const [showNewCustomerForm, setShowNewCustomerForm] = useState(false); // Show/hide add customer form
    const [loading, setLoading] = useState(false); // Loading state for API calls
    const [editingIndex, setEditingIndex] = useState(null); // Index of weight being edited
    const [editWeight, setEditWeight] = useState(''); // Temporary value for editing

    // New customer form data
    const [newCustomer, setNewCustomer] = useState({
        customer_id: '',
        name: '',
        phone: '',
        address: ''
    });

    // Error and success messages
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState(''); // 'success' or 'error'
    const [printError, setPrintError] = useState(null);
    const [reprinting, setReprinting] = useState(false);
    const [lastJobNumber, setLastJobNumber] = useState(null);

    const todayIST = () => {
        const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        return ist.toISOString().split('T')[0];
    };

    const [receivedDate, setReceivedDate] = useState(todayIST);

    // Ornament type selection
    const [ornamentTypes, setOrnamentTypes] = useState([]);
    const [ornamentSearch, setOrnamentSearch] = useState('');
    const [showOrnamentDropdown, setShowOrnamentDropdown] = useState(false);
    const [selectedOrnamentTypeId, setSelectedOrnamentTypeId] = useState(null);
    const [isOtherSelected, setIsOtherSelected] = useState(false);
    const [otherOrnamentName, setOtherOrnamentName] = useState('');
    const ornamentDropdownRef = useRef(null);

    // Base URL for your backend API
    const { API_BASE } = require('../utils/api');

    // useEffect runs when component loads (similar to page load event)
    useEffect(() => {
        console.log('🚀 InitialBill component loaded');
        loadInitialData();
        startWeightPolling();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ornamentDropdownRef.current && !ornamentDropdownRef.current.contains(e.target)) {
                setShowOrnamentDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load customers when component starts
    const loadInitialData = async () => {
        try {
            console.log('📊 Loading initial data...');

            const [customersResponse, ornamentResponse] = await Promise.all([
                axios.get(`${API_BASE}/api/customers`),
                axios.get(`${API_BASE}/api/ornament-types`)
            ]);
            setCustomers(customersResponse.data);
            setOrnamentTypes(ornamentResponse.data);
            console.log(`✅ Loaded ${customersResponse.data.length} customers, ${ornamentResponse.data.length} ornament types`);

        } catch (error) {
            console.error('❌ Error loading data:', error);
            showMessage('Error loading data. Make sure backend server is running.', 'error');
        }
    };

    // Poll weight from scale every 2 seconds (mock for now)
    const startWeightPolling = () => {
        const interval = setInterval(async () => {
            try {
                const response = await axios.get(`${API_BASE}/api/weight`);
                setCurrentWeight(response.data.weight);
            } catch (error) {
                console.error('Error reading weight:', error);
            }
        }, 2000);
        
        // Cleanup interval when component unmounts
        return () => clearInterval(interval);
    };

    // Capture current weight and add to list
    const captureWeight = () => {
        setIsWeighing(true);
        const capturedWeight = parseFloat(currentWeight.toFixed(1));
        setWeightCaptures(prev => [...prev, capturedWeight]);
        console.log(`⚖️  Weight captured: ${capturedWeight}g`);

        // Stop animation after 1 second
        setTimeout(() => setIsWeighing(false), 1000);
    };

    // Remove a captured weight
    const removeWeight = (index) => {
        setWeightCaptures(prev => prev.filter((_, i) => i !== index));
        console.log(`🗑️  Removed weight at index ${index}`);
    };

    // Start editing a weight
    const startEditWeight = (index) => {
        setEditingIndex(index);
        setEditWeight(weightCaptures[index].toString());
    };

    // Save edited weight
    const saveEditWeight = () => {
        if (editWeight && parseFloat(editWeight) > 0) {
            setWeightCaptures(prev => {
                const updated = [...prev];
                updated[editingIndex] = parseFloat(editWeight);
                return updated;
            });
        }
        setEditingIndex(null);
        setEditWeight('');
    };

    // Cancel editing
    const cancelEditWeight = () => {
        setEditingIndex(null);
        setEditWeight('');
    };

    // Calculate total weight (floor each weight first, then sum)
    const getTotalWeight = () => {
        return weightCaptures.reduce((sum, weight) => sum + Math.floor(weight), 0);
    };

    // Handle customer selection
    const handleCustomerSelect = (customerId) => {
        setSelectedCustomer(customerId);
        setShowNewCustomerForm(false);
        console.log(`👤 Selected customer: ${customerId}`);
    };

    // Handle new customer form submission
    const handleAddCustomer = async (e) => {
        e.preventDefault();
        
        // Validation
        if (!newCustomer.customer_id || !newCustomer.name) {
            showMessage('Customer ID and Name are required', 'error');
            return;
        }
        
        if (!/^[A-Z]{3}$/.test(newCustomer.customer_id)) {
            showMessage('Customer ID must be exactly 3 uppercase letters (e.g., XYZ)', 'error');
            return;
        }
        
        try {
            setLoading(true);
            console.log('👤 Adding new customer:', newCustomer.customer_id);

            // eslint-disable-next-line no-unused-vars
            const response = await axios.post(`${API_BASE}/api/customers`, newCustomer);

            // Reload customers list
            await loadInitialData();
            
            // Select the new customer
            setSelectedCustomer(newCustomer.customer_id);
            
            // Reset form
            setNewCustomer({ customer_id: '', name: '', phone: '', address: '' });
            setShowNewCustomerForm(false);
            
            showMessage(`Customer ${newCustomer.customer_id} added successfully!`, 'success');
            
        } catch (error) {
            console.error('❌ Error adding customer:', error);
            const errorMsg = error.response?.data?.error || 'Failed to add customer';
            showMessage(errorMsg, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Handle job form submission
    const handleCreateJob = async (e) => {
        e.preventDefault();

        // Validation
        if (!selectedCustomer) {
            showMessage('Please select a customer', 'error');
            return;
        }

        if (weightCaptures.length === 0) {
            showMessage('Please capture at least one weight', 'error');
            return;
        }

        if (!selectedOrnamentTypeId && !(isOtherSelected && otherOrnamentName.trim())) {
            showMessage('Please select an ornament type', 'error');
            return;
        }

        try {
            setLoading(true);
            setPrintError(null);
            console.log('📝 Creating new job...');

            let ornamentTypeId = selectedOrnamentTypeId;
            if (isOtherSelected && otherOrnamentName.trim()) {
                const ornResp = await axios.post(`${API_BASE}/api/ornament-types`, { name: otherOrnamentName.trim() });
                ornamentTypeId = ornResp.data.id;
                setOrnamentTypes(prev => prev.find(t => t.id === ornResp.data.id) ? prev : [...prev, ornResp.data]);
            }

            const jobData = {
                customer_id: selectedCustomer,
                weight_captures: weightCaptures,
                ornament_type_id: ornamentTypeId || null,
                received_date: receivedDate
            };

            const response = await axios.post(`${API_BASE}/api/jobs/initial`, jobData);

            console.log('✅ Job created:', response.data.job.job_number);

            // Show success message with job number
            showMessage(`Job ${response.data.job.job_number} created successfully! Total weight: ${response.data.job.initial_weight}g`, 'success');

            setLastJobNumber(response.data.job.job_number);
            setPrintError(response.data.printError || null);

            // Download PDF receipt
            await downloadReceipt(response.data.job.job_number);

            // Reset form
            resetForm();

        } catch (error) {
            console.error('❌ Error creating job:', error);
            const errorMsg = error.response?.data?.error || 'Failed to create job';
            showMessage(errorMsg, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Reset job form
    const resetForm = () => {
        setSelectedCustomer('');
        setWeightCaptures([]);
        setSelectedOrnamentTypeId(null);
        setOrnamentSearch('');
        setIsOtherSelected(false);
        setOtherOrnamentName('');
        setReceivedDate(todayIST());
    };

    // Show message to user
    const showMessage = (text, type) => {
        setMessage(text);
        setMessageType(type);

        // Auto-hide message after 5 seconds
        setTimeout(() => {
            setMessage('');
            setMessageType('');
        }, 5000);
    };

    // Download PDF receipt for a job
    const downloadReceipt = async (jobNumber) => {
        try {
            console.log(`🖨️  Downloading PDF receipt for job: ${jobNumber}`);

            const response = await axios.get(`${API_BASE}/api/jobs/${jobNumber}/receipt`, {
                responseType: 'blob' // Important: tells axios to expect binary data
            });

            // Create a blob URL and trigger download
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `receipt-${jobNumber}.pdf`;
            document.body.appendChild(link);
            link.click();

            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);

            console.log(`✅ PDF receipt downloaded for job: ${jobNumber}`);
        } catch (error) {
            console.error('❌ Error downloading receipt:', error);
            showMessage('Failed to download receipt. Job was created successfully.', 'error');
        }
    };

    // Handle reprint of receipt
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

    // Get selected customer name for display
    const getSelectedCustomerName = () => {
        const customer = customers.find(c => c.customer_id === selectedCustomer);
        return customer ? customer.name : '';
    };

    const filteredOrnamentTypes = ornamentTypes.filter(t =>
        t.name.toLowerCase().includes(ornamentSearch.toLowerCase())
    );

    const selectOrnamentType = (type) => {
        setSelectedOrnamentTypeId(type.id);
        setOrnamentSearch(type.name);
        setIsOtherSelected(false);
        setOtherOrnamentName('');
        setShowOrnamentDropdown(false);
    };

    const selectOther = () => {
        setSelectedOrnamentTypeId(null);
        setOrnamentSearch('Other');
        setIsOtherSelected(true);
        setOtherOrnamentName('');
        setShowOrnamentDropdown(false);
    };

    return (
        <div className="initial-bill-container">
            <div className="header">
                <h1>🏭 Silver Ornament Polishing</h1>
                <h2>Create Initial Bill</h2>
            </div>

            {/* Message Display */}
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

            {/* Weight Display Section */}
            <div className="weight-section">
                <div className="weight-display">
                    <h3>⚖️ Current Weight</h3>
                    <div className="weight-value">{currentWeight.toFixed(1)} g</div>
                    <button
                        onClick={captureWeight}
                        className={`capture-btn ${isWeighing ? 'weighing' : ''}`}
                        disabled={isWeighing}
                    >
                        {isWeighing ? '⏳ Capturing...' : '📸 Capture Weight'}
                    </button>
                </div>

                {/* Captured Weights List */}
                {weightCaptures.length > 0 && (
                    <div className="weight-captures-list">
                        <h4>Captured Weights:</h4>
                        <ul>
                            {weightCaptures.map((weight, index) => (
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
                                            <button onClick={saveEditWeight} className="btn-save">✓</button>
                                            <button onClick={cancelEditWeight} className="btn-cancel">✗</button>
                                        </div>
                                    ) : (
                                        <div className="weight-item">
                                            <span>{Math.floor(weight)} g</span>
                                            <button onClick={() => startEditWeight(index)} className="btn-edit">✏️</button>
                                            <button onClick={() => removeWeight(index)} className="btn-remove">🗑️</button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <div className="total-weight">
                            <strong>Total Weight: {getTotalWeight()} g</strong>
                        </div>
                    </div>
                )}
            </div>

            {/* Customer Selection Section */}
            <div className="customer-section">
                <h3>👤 Customer Selection</h3>
                
                <div className="customer-selection">
                    <select 
                        value={selectedCustomer}
                        onChange={(e) => handleCustomerSelect(e.target.value)}
                        className="customer-dropdown"
                    >
                        <option value="">-- Select Customer --</option>
                        {customers.map(customer => (
                            <option key={customer.customer_id} value={customer.customer_id}>
                                {customer.customer_id} - {customer.name}
                            </option>
                        ))}
                    </select>
                    
                    <button 
                        onClick={() => setShowNewCustomerForm(true)}
                        className="btn-secondary"
                        type="button"
                    >
                        ➕ Add New Customer
                    </button>
                </div>

                {selectedCustomer && (
                    <div className="selected-customer">
                        ✅ Selected: <strong>{selectedCustomer} - {getSelectedCustomerName()}</strong>
                    </div>
                )}
            </div>

            {/* New Customer Form */}
            {showNewCustomerForm && (
                <div className="new-customer-form">
                    <h4>➕ Add New Customer</h4>
                    <form onSubmit={handleAddCustomer}>
                        <div className="form-row">
                            <input
                                type="text"
                                placeholder="Customer ID (3 letters, e.g., XYZ)"
                                maxLength="3"
                                value={newCustomer.customer_id}
                                onChange={(e) => setNewCustomer(prev => ({
                                    ...prev, 
                                    customer_id: e.target.value.toUpperCase()
                                }))}
                                required
                            />
                            <input
                                type="text"
                                placeholder="Customer Name *"
                                value={newCustomer.name}
                                onChange={(e) => setNewCustomer(prev => ({
                                    ...prev, 
                                    name: e.target.value
                                }))}
                                required
                            />
                        </div>
                        
                        <div className="form-row">
                            <input
                                type="text"
                                placeholder="Phone Number"
                                value={newCustomer.phone}
                                onChange={(e) => setNewCustomer(prev => ({
                                    ...prev, 
                                    phone: e.target.value
                                }))}
                            />
                            <input
                                type="text"
                                placeholder="Address"
                                value={newCustomer.address}
                                onChange={(e) => setNewCustomer(prev => ({
                                    ...prev, 
                                    address: e.target.value
                                }))}
                            />
                        </div>
                        
                        <div className="form-buttons">
                            <button type="submit" disabled={loading} className="btn-primary">
                                {loading ? '⏳ Adding...' : '✅ Add Customer'}
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setShowNewCustomerForm(false)}
                                className="btn-secondary"
                            >
                                ❌ Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Received Date */}
            <div className="received-date-section">
                <h3>📅 Date Received</h3>
                <input
                    type="date"
                    value={receivedDate}
                    max={todayIST()}
                    onChange={e => setReceivedDate(e.target.value)}
                    className="received-date-input"
                />
            </div>

            {/* Ornament Type Section */}
            <div className="ornament-section">
                <h3>💍 Ornament Type</h3>
                <div className="ornament-dropdown-container" ref={ornamentDropdownRef}>
                    <input
                        type="text"
                        className="ornament-search-input"
                        placeholder="Search or select ornament type..."
                        value={ornamentSearch}
                        onChange={(e) => {
                            setOrnamentSearch(e.target.value);
                            setSelectedOrnamentTypeId(null);
                            setIsOtherSelected(false);
                            setShowOrnamentDropdown(true);
                        }}
                        onFocus={() => setShowOrnamentDropdown(true)}
                    />
                    {showOrnamentDropdown && (
                        <div className="ornament-dropdown-list">
                            {filteredOrnamentTypes.map(type => (
                                <div
                                    key={type.id}
                                    className="ornament-dropdown-item"
                                    onMouseDown={() => selectOrnamentType(type)}
                                >
                                    {type.name}
                                </div>
                            ))}
                            <div
                                className="ornament-dropdown-item ornament-other"
                                onMouseDown={selectOther}
                            >
                                + Other
                            </div>
                        </div>
                    )}
                </div>
                {isOtherSelected && (
                    <input
                        type="text"
                        className="ornament-other-input"
                        placeholder="Enter new ornament type name..."
                        value={otherOrnamentName}
                        onChange={(e) => setOtherOrnamentName(e.target.value)}
                        autoFocus
                    />
                )}
                {selectedOrnamentTypeId && (
                    <div className="selected-ornament">
                        ✅ Selected: <strong>{ornamentSearch}</strong>
                    </div>
                )}
            </div>

            {/* Job Creation Section */}
            {selectedCustomer && weightCaptures.length > 0 && (
                <div className="job-summary">
                    <h3>📋 Bill Summary</h3>
                    <div className="summary-details">
                        <div className="summary-line">
                            <span>Customer:</span>
                            <span><strong>{selectedCustomer} - {getSelectedCustomerName()}</strong></span>
                        </div>
                        <div className="summary-line">
                            <span>Date Received:</span>
                            <span><strong>{receivedDate}</strong></span>
                        </div>
                        <div className="summary-line">
                            <span>Total Weight:</span>
                            <span><strong>{getTotalWeight()} g</strong></span>
                        </div>
                        <div className="summary-line">
                            <span>Individual Captures:</span>
                            <span>{weightCaptures.length} weights</span>
                        </div>
                        {(selectedOrnamentTypeId || (isOtherSelected && otherOrnamentName)) && (
                            <div className="summary-line">
                                <span>Ornament Type:</span>
                                <span><strong>{isOtherSelected ? otherOrnamentName : ornamentSearch}</strong></span>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleCreateJob}
                        disabled={loading}
                        className="btn-primary submit-btn"
                    >
                        {loading ? '⏳ Creating...' : '🖨️ Create Bill & Print Receipt'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default InitialBill;