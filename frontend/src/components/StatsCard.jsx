import React from 'react';

const StatsCard = ({ icon, label, value, color = 'var(--primary)', sublabel }) => (
  <div className="stats-card">
    <div className="stats-card-icon" style={{ background: `${color}22`, color }}>
      {icon}
    </div>
    <div className="stats-card-body">
      <div className="stats-card-value">{value}</div>
      <div className="stats-card-label">{label}</div>
      {sublabel && <div className="stats-card-sublabel">{sublabel}</div>}
    </div>
  </div>
);

export default StatsCard;
