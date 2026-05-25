import React, { useState } from 'react';
import './Archive.css';

const Archive = () => {
    // Helper function to get last month
    const getLastMonth = () => {
        const today = new Date();
        today.setMonth(today.getMonth() - 1);
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    };

    // State
    const [selectedMonth, setSelectedMonth] = useState(getLastMonth());
    const [preview, setPreview] = useState(null);
    const [result, setResult] = useState(null);
    const [deleteAfterExport, setDeleteAfterExport] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Load preview when month changes
    const loadPreview = async () => {
        if (!selectedMonth) return;

        setLoading(true);
        setError(null);
        setPreview(null);
        setResult(null);

        try {
            const url = `http://localhost:3001/api/archive/monthly?month=${selectedMonth}`;
            const response = await fetch(url);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to load preview');
            }

            const data = await response.json();
            setPreview(data);
        } catch (err) {
            console.error('Error loading preview:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Generate Excel files
    const generateExcelFiles = async () => {
        if (!selectedMonth) return;

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const url = 'http://localhost:3001/api/archive/monthly';
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    month: selectedMonth,
                    deleteAfterExport
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate Excel files');
            }

            const data = await response.json();
            setResult(data);
            setPreview(null); // Clear preview after successful generation
        } catch (err) {
            console.error('Error generating Excel files:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="archive-container">
            <h2>📦 Monthly Archive</h2>
            <p className="archive-description">
                Generate Excel files for all customers with completed jobs in a specific month.
                Each customer will get their own Excel file with job details.
            </p>

            {/* Month Selection */}
            <div className="archive-section">
                <h3>Select Month to Archive</h3>
                <div className="month-selector">
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => {
                            setSelectedMonth(e.target.value);
                            setPreview(null);
                            setResult(null);
                            setError(null);
                        }}
                        className="month-input"
                    />
                    <button onClick={loadPreview} className="preview-button" disabled={loading}>
                        {loading ? 'Loading...' : 'Load Preview'}
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="error-message">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {/* Preview Section */}
            {preview && (
                <div className="archive-section">
                    <h3>Preview: {preview.month_display}</h3>
                    <div className="preview-stats">
                        <div className="stat-card">
                            <div className="stat-value">{preview.total_customers}</div>
                            <div className="stat-label">Customers</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{preview.total_jobs}</div>
                            <div className="stat-label">Completed Jobs</div>
                        </div>
                    </div>

                    {preview.total_customers === 0 ? (
                        <div className="empty-state">
                            <p>No completed jobs found for {preview.month_display}</p>
                        </div>
                    ) : (
                        <>
                            <div className="customer-list">
                                <h4>Customers to Archive ({preview.customers.length})</h4>
                                <table className="preview-table">
                                    <thead>
                                        <tr>
                                            <th>Customer ID</th>
                                            <th>Name</th>
                                            <th>Jobs</th>
                                            <th>Total Aavak (g)</th>
                                            <th>Total Javak (g)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.customers.map((customer) => (
                                            <tr key={customer.customer_id}>
                                                <td>{customer.customer_id}</td>
                                                <td>{customer.customer_name}</td>
                                                <td>{customer.job_count}</td>
                                                <td className="numeric">{customer.total_aavak}</td>
                                                <td className="numeric">{customer.total_javak}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="actions-section">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={deleteAfterExport}
                                        onChange={(e) => setDeleteAfterExport(e.target.checked)}
                                    />
                                    <span>Delete jobs from database after export (⚠️ Cannot be undone)</span>
                                </label>

                                <button
                                    onClick={generateExcelFiles}
                                    className="generate-button"
                                    disabled={loading}
                                >
                                    {loading ? 'Generating...' : '📥 Generate Excel Files'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Result Section */}
            {result && (
                <div className="archive-section success-section">
                    <h3>✅ Archive Complete!</h3>
                    <div className="result-stats">
                        <p><strong>Month:</strong> {result.month_display}</p>
                        <p><strong>Customers:</strong> {result.total_customers}</p>
                        <p><strong>Total Jobs:</strong> {result.total_jobs}</p>
                        <p><strong>Files Location:</strong> <code>{result.archive_path}</code></p>
                        {result.deleted && (
                            <p className="warning-text">
                                ⚠️ {result.total_jobs} jobs have been deleted from the database
                            </p>
                        )}
                    </div>

                    <div className="files-list">
                        <h4>Generated Files ({result.files.length})</h4>
                        <table className="files-table">
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Filename</th>
                                    <th>Jobs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.files.map((file, index) => (
                                    <tr key={index}>
                                        <td>{file.customer_id} - {file.customer_name}</td>
                                        <td className="filename">{file.filename}</td>
                                        <td>{file.job_count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="result-actions">
                        <p className="info-text">
                            📁 Excel files have been created in: <code>{result.archive_path}</code>
                        </p>
                        <p className="info-text">
                            💡 You can now copy these files to your external drive or backup location.
                        </p>
                        <button
                            onClick={() => {
                                setResult(null);
                                setPreview(null);
                                setSelectedMonth(getLastMonth());
                            }}
                            className="reset-button"
                        >
                            Archive Another Month
                        </button>
                    </div>
                </div>
            )}

            {/* Instructions */}
            {!preview && !result && !loading && (
                <div className="archive-section instructions">
                    <h3>How to Use</h3>
                    <ol>
                        <li>Select the month you want to archive (typically previous month)</li>
                        <li>Click "Load Preview" to see what will be archived</li>
                        <li>Review the list of customers and job counts</li>
                        <li>Optional: Check "Delete after export" to remove jobs from database</li>
                        <li>Click "Generate Excel Files" to create Excel files</li>
                        <li>Copy the generated files from the archive folder to your external drive</li>
                    </ol>

                    <div className="tip-box">
                        <strong>💡 Tip:</strong> Run this on the 5th or 6th of each month to archive the previous month's data.
                    </div>
                </div>
            )}
        </div>
    );
};

export default Archive;
