import React, { useState } from 'react';
import {
  Cloud, LayoutDashboard, FolderOpen, Star, Share2,
  Settings, ChevronLeft, ChevronRight, Upload, Trash2
} from 'lucide-react';

const FOLDERS = ['All', 'Documents', 'Images', 'Videos', 'Others'];

const navItems = [
  { id: 'all',       icon: <LayoutDashboard size={18} />, label: 'All Files' },
  { id: 'Documents', icon: <FolderOpen size={18} />,     label: 'Documents' },
  { id: 'Images',    icon: <FolderOpen size={18} />,     label: 'Images' },
  { id: 'Videos',    icon: <FolderOpen size={18} />,     label: 'Videos' },
  { id: 'Others',    icon: <FolderOpen size={18} />,     label: 'Others' },
  { id: 'favorites', icon: <Star size={18} />,           label: 'Favorites' },
  { id: 'shared',    icon: <Share2 size={18} />,         label: 'Shared' },
  { id: 'trash',     icon: <Trash2 size={18} />,         label: 'Recycle Bin' },
];

const Sidebar = ({ activeFolder, onFolderChange, onUpload, stats }) => {
  const [collapsed, setCollapsed] = useState(false);

  const formatStorage = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const MAX_STORAGE = 5 * 1024 * 1024 * 1024; // 5 GB limit (display only)
  const usedPct = stats ? Math.min((stats.totalSize / MAX_STORAGE) * 100, 100) : 0;

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <Cloud size={28} color="var(--primary)" />
        {!collapsed && <span className="sidebar-logo-text">Cloud Vault</span>}
      </div>

      {/* Upload CTA */}
      <button className="btn btn-primary sidebar-upload" onClick={onUpload}>
        <Upload size={16} />
        {!collapsed && 'Upload'}
      </button>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activeFolder === item.id ? 'active' : ''}`}
            onClick={() => onFolderChange(item.id)}
            title={collapsed ? item.label : ''}
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Storage usage */}
      {!collapsed && stats && (
        <div className="sidebar-storage">
          <div className="storage-header">
            <span>Storage</span>
            <span>{formatStorage(stats.totalSize)} / 5 GB</span>
          </div>
          <div className="storage-bar-track">
            <div className="storage-bar-fill" style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button className="sidebar-collapse-btn" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
};

export default Sidebar;
