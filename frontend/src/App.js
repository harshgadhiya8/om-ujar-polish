// src/App.js
import React, { useState } from 'react';
import InitialBill from './components/InitialBill';
import CompleteJob from './components/CompleteJob';
import CustomerLedger from './components/CustomerLedger';
import DailyLedger from './components/DailyLedger';
import Archive from './components/Archive';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('create');

  return (
    <div className="App">
      <div className="app-header">
        <h1>🪙 Om Ujar Polish - Silver Ornament Management</h1>
      </div>

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