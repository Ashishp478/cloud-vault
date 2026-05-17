import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Upload, Trash2, Pencil, Star, Share2, Download, Shield } from 'lucide-react';

const ACTION_META = {
  Upload:   { icon: <Upload size={14} />,   color: '#00C9A7', bg: '#00C9A722' },
  Delete:   { icon: <Trash2 size={14} />,   color: '#FF6B6B', bg: '#FF6B6B22' },
  Rename:   { icon: <Pencil size={14} />,   color: '#FFC75F', bg: '#FFC75F22' },
  Favorite: { icon: <Star size={14} />,     color: '#A78BFA', bg: '#A78BFA22' },
  Share:    { icon: <Share2 size={14} />,   color: '#6C63FF', bg: '#6C63FF22' },
  Download: { icon: <Download size={14} />, color: '#34D399', bg: '#34D39922' },
  Security: { icon: <Shield size={14} />,   color: '#FF79C6', bg: '#FF79C622' },
};

const ActivityTimeline = ({ activities = [] }) => (
  <div className="chart-card activity-card">
    <h3 className="chart-title">Recent Activity</h3>
    {activities.length === 0 ? (
      <div className="chart-empty">No activity yet</div>
    ) : (
      <div className="activity-list">
        {activities.map((a) => {
          // Backward-compatibility: Dynamically remap old database logs to the 'Security' layout
          let resolvedActionType = a.actionType;
          if (
            a.fileName === 'Account Registered' ||
            a.fileName.includes('Logged in') ||
            a.fileName.includes('Password') ||
            a.fileName.includes('2FA')
          ) {
            resolvedActionType = 'Security';
          }

          const meta = ACTION_META[resolvedActionType] || ACTION_META.Upload;
          return (
            <div key={a._id} className="activity-item">
              <div className="activity-icon" style={{ background: meta.bg, color: meta.color }}>
                {meta.icon}
              </div>
              <div className="activity-body">
                <span className="activity-action" style={{ color: meta.color }}>{resolvedActionType}</span>
                <span className="activity-file">{a.fileName}</span>
              </div>
              <div className="activity-time">
                {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default ActivityTimeline;
