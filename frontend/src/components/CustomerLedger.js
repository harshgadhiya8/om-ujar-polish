import React, { useState, useEffect } from 'react';
import { API_BASE } from '../utils/api';
import './CustomerLedger.css';

const CustomerLedger = () => {
    // Helper functions for month calculation
    const getTodayMonth = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    };

    const getLastMonth = () => {
        const today = new Date();
        today.setMonth(today.getMonth() - 1);
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    };

    // State management
    const [customers, setCustomers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(getTodayMonth());
    const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'detailed'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Column definitions for summary view (5 columns)
    const summaryColumns = [
        { key: 'job_number', label: 'Job Number' },
        { key: 'delivered_at', label: 'Date' },
        { key: 'aavak_vajan', label: 'Aavak Vajan (g)', isNumeric: true },
        { key: 'javak_vajan', label: 'Javak Vajan (g)', isNumeric: true },
        { key: 'ghat', label: 'Ghat (g)', isNumeric: true },
        { key: 'fine', label: 'Fine (g)', isNumeric: true }
    ];

    // Column definitions for detailed view (10 columns)
    const detailedColumns = [
        { key: 'delivered_at', label: 'Date' },
        { key: 'job_number', label: 'Job Number' },
        { key: 'customer_id', label: 'Customer ID' },
        { key: 'customer_name', label: 'Customer Name' },
        { key: 'ornament_type_name', label: 'Ornament Type' },
        { key: 'aavak_vajan', label: 'Aavak Vajan (g)', isNumeric: true },
        { key: 'javak_vajan', label: 'Javak Vajan (g)', isNumeric: true },
        { key: 'bag_vajan', label: 'Bag Vajan (g)', isNumeric: true },
        { key: 'customer_bag_weight', label: 'Customer Bag Weight (g)', isNumeric: true },
        { key: 'ghat', label: 'Ghat (g)', isNumeric: true },
        { key: 'fine', label: 'Fine (g)', isNumeric: true }
    ];

    // Fetch customers on component mount
    useEffect(() => {
        fetchCustomers();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownOpen && !event.target.closest('.searchable-dropdown')) {
                setDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [dropdownOpen]);

    // Fetch customers from API (Mode 1: Customer List)
    const fetchCustomers = async () => {
        setLoading(true);
        setError(null);

        try {
            const url = `${API_BASE}/api/customer-ledger`;
            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch customers');
            }

            const data = await response.json();
            setCustomers(data.customers || []);
        } catch (err) {
            console.error('Error fetching customers:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Filter customers based on search term (search by both ID and name)
    const filteredCustomers = customers.filter(customer => {
        const searchLower = searchTerm.toLowerCase();
        return (
            customer.customer_id.toString().toLowerCase().includes(searchLower) ||
            customer.name.toLowerCase().includes(searchLower)
        );
    });

    // Handle customer selection from dropdown
    const handleCustomerSelect = (customer) => {
        setSelectedCustomer(customer);
        setDropdownOpen(false);
        setSearchTerm(''); // Clear search after selection
    };

    // Helper function to format date for display
    const formatDateForDisplay = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // State for month selection
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonthName, setSelectedMonthName] = useState(null);
    const [ledgerData, setLedgerData] = useState(null);
    const [validationError, setValidationError] = useState(null);

    // Handle back to customer list
    const handleBackToList = () => {
        setSelectedCustomer(null);
        setLedgerData(null);
        setError(null);
        setValidationError(null);
        setSelectedMonthName(null);
        setSelectedYear(new Date().getFullYear());
        setSearchTerm(''); // Clear search term
        setDropdownOpen(false); // Close dropdown
    };

    // Fetch ledger data from Mode 2 API
    const fetchLedger = async (customer_id, month) => {
        setLoading(true);
        setValidationError(null);

        try {
            const url = `${API_BASE}/api/customer-ledger?customer_id=${customer_id}&month=${month}`;
            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch ledger data');
            }

            const data = await response.json();
            setLedgerData(data);
        } catch (err) {
            console.error('Error fetching ledger:', err);
            setValidationError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle "This Month" button
    const handleThisMonth = () => {
        if (!selectedCustomer) return;
        const month = getTodayMonth();
        const monthNum = getMonthNumber(month.split('-')[1]);
        setSelectedMonthName(getMonthName(parseInt(month.split('-')[1])));
        setSelectedYear(parseInt(month.split('-')[0]));
        fetchLedger(selectedCustomer.customer_id, month);
    };

    // Handle "Last Month" button
    const handleLastMonth = () => {
        if (!selectedCustomer) return;
        const month = getLastMonth();
        const monthNum = parseInt(month.split('-')[1]);
        setSelectedMonthName(getMonthName(monthNum));
        setSelectedYear(parseInt(month.split('-')[0]));
        fetchLedger(selectedCustomer.customer_id, month);
    };

    // Handle "Show Ledger" button with validation
    const handleShowLedger = () => {
        setValidationError(null);

        // Validate selections
        if (!selectedMonthName) {
            setValidationError('Please select a month');
            return;
        }

        if (!selectedYear) {
            setValidationError('Please select a year');
            return;
        }

        if (!selectedCustomer) {
            setValidationError('Please select a customer');
            return;
        }

        // Format month as YYYY-MM
        const monthNum = getMonthNumber(selectedMonthName);
        const month = `${selectedYear}-${String(monthNum).padStart(2, '0')}`;

        // Fetch ledger data
        fetchLedger(selectedCustomer.customer_id, month);
    };

    // Convert month number (1-12) to month name
    const getMonthName = (monthNum) => {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months[monthNum - 1] || null;
    };

    // Convert month name to month number (1-12)
    const getMonthNumber = (monthName) => {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months.indexOf(monthName) + 1;
    };

    // Handle view mode toggle
    const handleViewModeChange = (mode) => {
        setViewMode(mode);
    };

    // Handle change month (go back to month selection)
    const handleChangeMonth = () => {
        setLedgerData(null);
    };

    // Download CSV
    const downloadCSV = () => {
        if (!ledgerData || ledgerData.jobs.length === 0) {
            return;
        }

        const url = `${API_BASE}/api/customer-ledger?customer_id=${ledgerData.customer_id}&month=${ledgerData.month}&format=csv&view=${viewMode}`;
        window.location.href = url;
    };

    // Download PDF
    const downloadPDF = () => {
        if (!ledgerData || ledgerData.jobs.length === 0) {
            return;
        }

        const url = `${API_BASE}/api/customer-ledger?customer_id=${ledgerData.customer_id}&month=${ledgerData.month}&format=pdf&view=${viewMode}`;
        window.location.href = url;
    };

    return (
        <div className="customer-ledger">
            <h2>Customer Ledger</h2>

            {/* Customer Selection Dropdown */}
            {!selectedCustomer && (
                <div className="customer-selection-section">
                    <h3>🔍 Select Customer</h3>

                    {/* Loading/Error states */}
                    {loading && <p className="loading">Loading customers...</p>}
                    {error && <p className="error">Error: {error}</p>}

                    {!loading && (
                        <div className="searchable-dropdown">
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search by customer ID or name..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setDropdownOpen(true);
                                }}
                                onFocus={() => setDropdownOpen(true)}
                            />

                            {dropdownOpen && (
                                <div className="dropdown-menu">
                                    {filteredCustomers.length === 0 ? (
                                        <div className="dropdown-item empty">
                                            {searchTerm
                                                ? 'No customers found matching your search'
                                                : 'No customers found'}
                                        </div>
                                    ) : (
                                        filteredCustomers.map((customer) => (
                                            <div
                                                key={customer.customer_id}
                                                className="dropdown-item"
                                                onClick={() => handleCustomerSelect(customer)}
                                            >
                                                <div className="item-main">
                                                    <span className="item-name">{customer.name}</span>
                                                    <span className="item-id">ID: {customer.customer_id}</span>
                                                </div>
                                                <div className="item-details">
                                                    <span>{customer.phone || 'No phone'}</span>
                                                    <span>{customer.total_jobs} jobs ({customer.completed_jobs} completed)</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {!dropdownOpen && filteredCustomers.length > 0 && (
                                <p className="hint-text">
                                    {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''} available - click to search
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Month Selection Section */}
            {selectedCustomer && !ledgerData && (
                <div className="month-selection-section">
                    <button onClick={handleBackToList} className="back-button">
                        ← Back to customer list
                    </button>

                    <div className="customer-header">
                        <h3>Customer: {selectedCustomer.name} ({selectedCustomer.customer_id})</h3>
                    </div>

                    <div className="month-selection-container">
                        <h4>Select Month</h4>

                        {/* Quick Selection Buttons */}
                        <div className="quick-selection">
                            <button
                                onClick={handleThisMonth}
                                className="quick-button"
                                title="Load current month ledger"
                            >
                                This Month
                            </button>
                            <button
                                onClick={handleLastMonth}
                                className="quick-button"
                                title="Load previous month ledger"
                            >
                                Last Month
                            </button>
                        </div>

                        {/* Custom Selection */}
                        <div className="custom-selection">
                            <div className="selection-row">
                                <div className="selection-group">
                                    <label htmlFor="month-select">Month:</label>
                                    <select
                                        id="month-select"
                                        value={selectedMonthName || ''}
                                        onChange={(e) => setSelectedMonthName(e.target.value)}
                                        className="month-dropdown"
                                    >
                                        <option value="">Select Month</option>
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
                                </div>

                                <div className="selection-group">
                                    <label htmlFor="year-select">Year:</label>
                                    <select
                                        id="year-select"
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                        className="year-dropdown"
                                    >
                                        <option value={2024}>2024</option>
                                        <option value={2025}>2025</option>
                                        <option value={2026}>2026</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={handleShowLedger}
                                className="show-ledger-button"
                                disabled={loading}
                            >
                                {loading ? 'Loading...' : 'Show Ledger'}
                            </button>
                        </div>

                        {/* Validation Error */}
                        {validationError && (
                            <div className="validation-error">
                                {validationError}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Ledger Data Display Section */}
            {selectedCustomer && ledgerData && (
                <div className="ledger-container">
                    {/* Ledger Header with Back and Change Month Buttons */}
                    <div className="ledger-header">
                        <button onClick={handleBackToList} className="back-button">
                            ← Back to Customers
                        </button>
                        <button onClick={handleChangeMonth} className="change-month-button">
                            Change Month
                        </button>
                    </div>

                    {/* Customer Ledger Heading */}
                    <div className="ledger-heading">
                        <h3>Customer Ledger</h3>
                        <div className="ledger-info">
                            <p><strong>{selectedCustomer.name}</strong> (ID: {selectedCustomer.customer_id})</p>
                            <p>{selectedMonthName} {selectedYear}</p>
                        </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="view-mode-toggle">
                        <button
                            className={`toggle-button ${viewMode === 'summary' ? 'active' : ''}`}
                            onClick={() => handleViewModeChange('summary')}
                        >
                            Summary View
                        </button>
                        <button
                            className={`toggle-button ${viewMode === 'detailed' ? 'active' : ''}`}
                            onClick={() => handleViewModeChange('detailed')}
                        >
                            Detailed View
                        </button>
                    </div>

                    {/* Job Table */}
                    {ledgerData.jobs && ledgerData.jobs.length > 0 ? (
                        <div className="job-table-wrapper">
                            <table className="job-table">
                                <thead>
                                    <tr>
                                        {(viewMode === 'summary' ? summaryColumns : detailedColumns).map((col) => (
                                            <th key={col.key} className={col.isNumeric ? 'numeric' : ''}>
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ledgerData.jobs.map((job, index) => (
                                        <tr key={index}>
                                            {(viewMode === 'summary' ? summaryColumns : detailedColumns).map((col) => {
                                                let value = job[col.key];

                                                // Format dates
                                                if (col.key === 'delivered_at' && value) {
                                                    value = formatDateForDisplay(value);
                                                }

                                                // Format numeric values
                                                if (col.isNumeric && value !== null && value !== undefined) {
                                                    value = Math.floor(value);
                                                }

                                                // Check if value is negative
                                                const isNegative = col.isNumeric && value < 0;

                                                return (
                                                    <td
                                                        key={col.key}
                                                        className={`${col.isNumeric ? 'numeric' : ''} ${isNegative ? 'negative' : ''}`}
                                                    >
                                                        {value || '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                                {/* Totals Row */}
                                {ledgerData.totals && (
                                    <tfoot>
                                        <tr className="totals-row">
                                            {(viewMode === 'summary' ? summaryColumns : detailedColumns).map((col) => {
                                                let value = ledgerData.totals[col.key];

                                                // Format numeric values
                                                if (col.isNumeric && value !== null && value !== undefined) {
                                                    value = Math.floor(value);
                                                }

                                                // Check if value is negative
                                                const isNegative = col.isNumeric && value < 0;

                                                return (
                                                    <td
                                                        key={col.key}
                                                        className={`${col.isNumeric ? 'numeric' : ''} ${isNegative ? 'negative' : ''}`}
                                                    >
                                                        {value || '-'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                            {/* Download Buttons */}
                            <div className="download-buttons">
                                <button onClick={downloadCSV}>Download CSV</button>
                                <button onClick={downloadPDF}>Download PDF</button>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p>No jobs found for {selectedMonthName} {selectedYear}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CustomerLedger;
