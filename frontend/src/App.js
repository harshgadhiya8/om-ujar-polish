// src/App.js
import React, { useState, useEffect } from 'react';
import InitialBill from './components/InitialBill';
import CompleteJob from './components/CompleteJob';
import CustomerLedger from './components/CustomerLedger';
import DailyLedger from './components/DailyLedger';
import Archive from './components/Archive';
import { API_BASE } from './utils/api';
import './App.css';

function DeviceStatusBar() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    function fetchStatus() {
      fetch(`${API_BASE}/api/status`)
        .then(r => r.json())
        .then(setStatus)
        .catch(() => setStatus(null));
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  const devices = [
    { label: 'Printer', key: 'printer' },
    { label: 'Scale',   key: 'scale'   },
  ];

  const allOk = devices.every(d => status[d.key] === 'connected' || status[d.key] === 'ready');

  return (
    <div className={`device-status-bar ${allOk ? 'all-ok' : 'has-warning'}`}>
      {devices.map(({ label, key }) => {
        const ok = status[key] === 'connected' || status[key] === 'ready';
        return (
          <span key={key} className={`device-pill ${ok ? 'ok' : 'warn'}`}>
            <span className="device-dot" />
            {label}: {ok ? 'Connected' : 'Not connected'}
          </span>
        );
      })}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('create');

  return (
    <div className="App">
      <div className="app-header">
        <h1>🪙 Om Ujar Polish - Silver Ornament Management</h1>
      </div>

      <DeviceStatusBar />

      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          ➕ Create Job
        </button>
        <button
          className={`tab-button ${activeTab === 'complete' ? 'active' : ''}`}
          onClick={() => setActiveTab('complete')}
        >
          ✅ Complete Job
        </button>
        <button
          className={`tab-button ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          📊 Daily Ledger
        </button>
        <button
          className={`tab-button ${activeTab === 'customer' ? 'active' : ''}`}
          onClick={() => setActiveTab('customer')}
        >
          👤 Customer Ledger
        </button>
        <button
          className={`tab-button ${activeTab === 'archive' ? 'active' : ''}`}
          onClick={() => setActiveTab('archive')}
        >
          📦 Archive
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'create' && <InitialBill />}
        {activeTab === 'complete' && <CompleteJob />}
        {activeTab === 'ledger' && <DailyLedger />}
        {activeTab === 'customer' && <CustomerLedger />}
        {activeTab === 'archive' && <Archive />}
      </div>
    </div>
  );
}

export default App;
