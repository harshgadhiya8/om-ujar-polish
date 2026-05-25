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

            {/* Loading/Error states */}
            {loading && <p>Loading ledger data...</p>}
            {error && <p className="error">Error: {error}</p>}

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

                            {/* Download Buttons */}
                            {ledgerData.jobs.length > 0 && (
                                <div className="download-buttons">
                                    <button onClick={downloadCSV}>Download CSV</button>
                                    <button onClick={downloadPDF}>Download PDF</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default DailyLedger;
