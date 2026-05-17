import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Bell, User, RefreshCw, Moon, Sun, Filter, ArrowUpDown,
  Files, HardDrive, Star, Share2, Folder, Plus, ChevronRight, 
  Sparkles, Trash2, ShieldCheck, Tag, X
} from 'lucide-react';

import { 
  fetchFiles, fetchStats, fetchActivities, searchFiles,
  fetchFolders, createFolder, deleteFolder, fetchTrash, fetchAISearch
} from '../api';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';

import Sidebar from '../components/Sidebar';
import StatsCard from '../components/StatsCard';
import FileItem from '../components/FileItem';
import UploadModal from '../components/UploadModal';
import FileTypePieChart from '../components/FileTypePieChart';
import ActivityTimeline from '../components/ActivityTimeline';
import ProfileSection from '../components/ProfileSection';

const formatStorage = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

const Dashboard = () => {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  // Custom directories state
  const [currentFolderId, setCurrentFolderId] = useState(null); // null represents root
  const [folderPath, setFolderPath] = useState([]); // Array of { _id, name } for breadcrumbs
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Search & Navigation views
  const [activeFolder, setActiveFolder] = useState('all'); // all, trash, favorites, shared, Documents...
  const [search, setSearch] = useState('');
  const [aiSearchActive, setAiSearchActive] = useState(false);
  const [selectedTag, setSelectedTag] = useState('All'); // All, Work, College, Personal
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest, name, size
  
  // Modals Toggles
  const [showUpload, setShowUpload] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const { addToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const searchTimer = useRef(null);

  // ── Load all data ─────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      let filesPromise;
      let foldersPromise = Promise.resolve({ data: [] });

      // Fetch files based on view state
      if (activeFolder === 'trash') {
        filesPromise = fetchTrash();
      } else if (['all', 'favorites', 'shared'].includes(activeFolder)) {
        // Fetch files inside current custom folder, filtering by tag
        const tagFilter = selectedTag === 'All' ? undefined : selectedTag;
        filesPromise = fetchFiles(currentFolderId || 'null', tagFilter);
        
        // Also fetch custom subfolders if in 'all' view
        if (activeFolder === 'all') {
          foldersPromise = fetchFolders(currentFolderId || 'null');
        }
      } else {
        // Category views (Documents, Images, etc)
        filesPromise = fetchFiles('all'); // Fetch all active to filter on client, or fetch by tag
      }

      const [filesRes, foldersRes, statsRes, actRes] = await Promise.all([
        filesPromise,
        foldersPromise,
        fetchStats(),
        fetchActivities(),
      ]);

      setFiles(filesRes.data);
      setFolders(foldersRes.data);
      setStats(statsRes.data);
      setActivities(actRes.data);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      } else {
        addToast('Error loading drive resources', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate, activeFolder, currentFolderId, selectedTag, addToast]);

  useEffect(() => { 
    loadAll(); 
  }, [loadAll]);

  // ── Debounced standard or semantic search ─────────────
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!search.trim()) { 
      // Avoid clearing active files on empty search
      if (search === '') return;
      loadAll(); 
      return; 
    }

    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (aiSearchActive) {
          // Gemini AI natural language search
          const { data } = await fetchAISearch(search);
          setFiles(data);
        } else {
          // Standard regex name search
          const folder = ['all', 'favorites', 'shared', 'trash'].includes(activeFolder) ? undefined : activeFolder;
          const { data } = await searchFiles(search, folder);
          setFiles(data);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 450); // slightly longer debounce for AI computations

    return () => clearTimeout(searchTimer.current);
  }, [search, activeFolder, aiSearchActive, loadAll]);

  // ── Handle Custom Folders navigations ─────────────────
  const handleFolderDoubleClick = (folder) => {
    setFolderPath((prev) => [...prev, { _id: folder._id, name: folder.name }]);
    setCurrentFolderId(folder._id);
    setSelectedTag('All'); // Reset tag pill on folder change
  };

  const handleBreadcrumbClick = (folderIndex) => {
    if (folderIndex === -1) {
      // Navigate to Root Drive
      setFolderPath([]);
      setCurrentFolderId(null);
    } else {
      const selected = folderPath[folderIndex];
      setFolderPath((prev) => prev.slice(0, folderIndex + 1));
      setCurrentFolderId(selected._id);
    }
    setSelectedTag('All');
  };

  // ── Folder creation ───────────────────────────────────
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setCreatingFolder(true);
    try {
      await createFolder(newFolderName.trim(), currentFolderId || null);
      addToast(`Folder "${newFolderName}" created!`, 'success');
      setNewFolderName('');
      setShowFolderModal(false);
      loadAll(); // Reload custom folders grid
    } catch (err) {
      addToast(err.response?.data?.message || 'Folder creation failed', 'error');
    } finally {
      setCreatingFolder(false);
    }
  };

  // ── Folder deletion ───────────────────────────────────
  const handleDeleteFolder = async (e, folderId, folderName) => {
    e.stopPropagation(); // Stop navigation trigger
    if (!window.confirm(`Are you sure you want to delete "${folderName}"? All files nested inside this directory will be moved to the Recycle Bin.`)) {
      return;
    }
    try {
      await deleteFolder(folderId);
      addToast(`Folder "${folderName}" and its contents removed.`, 'info');
      loadAll();
    } catch {
      addToast('Failed to delete folder', 'error');
    }
  };

  // ── Filter and Sort files ─────────────────────────────
  const getProcessedFiles = () => {
    let result = [...files];

    // Client-side filtering when viewing static folders/categories
    if (!['all', 'trash'].includes(activeFolder)) {
      result = result.filter((f) => {
        if (activeFolder === 'favorites') return f.isFavorite;
        if (activeFolder === 'shared') return f.isShared;
        return f.folder === activeFolder; // Mime categories: Documents, Images, etc.
      });

      // Filter category list by tag selection
      if (selectedTag !== 'All') {
        result = result.filter((f) => f.tags?.includes(selectedTag));
      }
    }

    // Sort computations
    return result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'name') return a.originalName.localeCompare(b.originalName);
      if (sortBy === 'size') return b.size - a.size;
      return 0;
    });
  };

  const processedFiles = getProcessedFiles();
  const recentFiles = [...files].filter(f => !f.isTrashed).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  // ── File action triggers ──────────────────────────────
  const handleDelete = () => {
    loadAll(); // Re-trigger quota sizes and activities timeline
  };

  const handleUpdate = (updated) => {
    setFiles((prev) => prev.map((f) => (f._id === updated._id ? updated : f)));
    fetchStats().then((r) => setStats(r.data)).catch(() => {});
    fetchActivities().then((r) => setActivities(r.data)).catch(() => {});
  };

  const folderLabel = {
    all: 'All Files',
    favorites: 'Favorites',
    shared: 'Shared Files',
    trash: 'Recycle Bin',
    Documents: 'Documents',
    Images: 'Images',
    Videos: 'Videos',
    Others: 'Others',
  };

  // Sync state between sidebar navigations and folder structures
  const handleNavChange = (folderId) => {
    setActiveFolder(folderId);
    // Reset custom directories when clicking non-'all' side links
    if (folderId !== 'all') {
      setCurrentFolderId(null);
      setFolderPath([]);
    }
    setSelectedTag('All');
    setSearch('');
  };

  return (
    <div className="dashboard-layout">
      <div className="blob"></div>
      <div className="blob blob-2"></div>
      
      {/* Sidebar */}
      <Sidebar
        activeFolder={activeFolder}
        onFolderChange={handleNavChange}
        onUpload={() => setShowUpload(true)}
        stats={stats}
      />

      {/* Main content */}
      <main className="dashboard-main">
        {/* Top Bar */}
        <header className="topbar">
          <div style={{ display: 'flex', gap: '0.75rem', flex: 1, alignItems: 'center' }}>
            <div className="topbar-search" style={{ flex: 1 }}>
              <Search size={16} className="search-icon" />
              <input
                className="search-input"
                placeholder={aiSearchActive ? "Ask Gemini to find files (e.g. 'Show HR documents')..." : "Search files by name..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            {/* Google Gemini AI Search Switcher */}
            {activeFolder !== 'trash' && (
              <button 
                className={`ai-search-toggle ${aiSearchActive ? 'active' : ''}`}
                onClick={() => {
                  setAiSearchActive(!aiSearchActive);
                  setSearch('');
                  loadAll();
                }}
                title="Search using Google Gemini NLP"
              >
                <Sparkles size={15} />
                <span>AI Search</span>
              </button>
            )}
          </div>

          <div className="topbar-actions" style={{ marginLeft: '1rem' }}>
            <button className="icon-btn btn-ghost" onClick={toggleTheme} title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-btn btn-ghost" onClick={loadAll} title="Refresh">
              <RefreshCw size={16} />
            </button>
            <button className="topbar-avatar" onClick={() => setShowProfile(true)} title="Settings">
              <User size={16} />
            </button>
          </div>
        </header>

        {/* Stats Cards */}
        {activeFolder !== 'trash' && (
          <section className="stats-row">
            <StatsCard
              icon={<Files size={22} />}
              label="Total Files"
              value={stats?.totalFiles ?? '—'}
              color="#6C63FF"
            />
            <StatsCard
              icon={<HardDrive size={22} />}
              label="Storage Used"
              value={formatStorage(stats?.totalSize)}
              color="#00C9A7"
            />
            <StatsCard
              icon={<Star size={22} />}
              label="Favorites"
              value={stats?.favoriteCount ?? '—'}
              color="#FFC75F"
            />
            <StatsCard
              icon={<Share2 size={22} />}
              label="Shared Files"
              value={stats?.sharedCount ?? '—'}
              color="#FF6B6B"
            />
          </section>
        )}

        {/* Charts & Timeline row */}
        {activeFolder !== 'trash' && search === '' && (
          <section className="charts-row">
            <FileTypePieChart typeStats={stats?.typeStats || []} />
            <ActivityTimeline activities={activities} />
          </section>
        )}

        {/* Breadcrumb Navigation / Directory Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>
              {folderLabel[activeFolder] || activeFolder}
            </h3>
            
            {/* Folder breadcrumbs */}
            {activeFolder === 'all' && (
              <div className="breadcrumbs" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                <span className={`breadcrumb-item ${currentFolderId === null ? 'active' : ''}`} onClick={() => handleBreadcrumbClick(-1)}>
                  My Drive
                </span>
                {folderPath.map((folder, idx) => (
                  <React.Fragment key={folder._id}>
                    <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                    <span 
                      className={`breadcrumb-item ${idx === folderPath.length - 1 ? 'active' : ''}`} 
                      onClick={() => handleBreadcrumbClick(idx)}
                    >
                      {folder.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {/* Create custom folder button */}
            {activeFolder === 'all' && (
              <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', fontSize: '0.85rem' }} onClick={() => setShowFolderModal(true)}>
                <Plus size={16} /> New Folder
              </button>
            )}

            {/* Sort Dropdown */}
            <div className="sort-dropdown">
              <ArrowUpDown size={14} style={{ marginRight: '0.5rem', color: 'var(--text-secondary)' }} />
              <select 
                className="upload-select" 
                style={{ padding: '0.4rem 2rem 0.4rem 0.5rem', fontSize: '0.85rem' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name">Name (A-Z)</option>
                <option value="size">Largest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tags filtering pillbar row */}
        {activeFolder !== 'trash' && (
          <div className="tags-row">
            {['All', 'Work', 'College', 'Personal'].map((tag) => (
              <button 
                key={tag} 
                className={`tag-pill ${selectedTag === tag ? 'active' : ''}`}
                onClick={() => setSelectedTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Recycle Bin Notice Box */}
        {activeFolder === 'trash' && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px dashed var(--error)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Trash2 size={16} color="var(--error)" />
            <span>Files in the Recycle Bin will be automatically purged after <strong>30 days</strong>.</span>
          </div>
        )}

        {/* 1. Custom Directories Subfolders Grid */}
        {activeFolder === 'all' && folders.length > 0 && search === '' && (
          <section className="section-block">
            <h4 className="section-subtitle">Folders</h4>
            <div className="folder-grid">
              {folders.map((fold) => (
                <div 
                  key={fold._id} 
                  className="folder-item" 
                  onDoubleClick={() => handleFolderDoubleClick(fold)}
                  title="Double click to open folder"
                >
                  <Folder size={18} color="var(--primary)" fill="rgba(108, 99, 255, 0.2)" />
                  <span className="folder-item-name">{fold.name}</span>
                  <button 
                    className="icon-btn folder-item-delete"
                    style={{ padding: 0 }}
                    onClick={(e) => handleDeleteFolder(e, fold._id, fold.name)}
                    title="Delete folder recursive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. Recently Uploaded Grid */}
        {search === '' && activeFolder === 'all' && currentFolderId === null && recentFiles.length > 0 && (
          <section className="section-block">
            <h4 className="section-subtitle">Recently Uploaded</h4>
            <div className="file-list">
              {recentFiles.map((file) => (
                <FileItem key={file._id} file={file} onDelete={handleDelete} onUpdate={handleUpdate} />
              ))}
            </div>
          </section>
        )}

        {/* 3. Main File list Section */}
        <section className="section-block">
          {activeFolder === 'all' && folders.length > 0 && <h4 className="section-subtitle">Files</h4>}
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Syncing files…</p>
            </div>
          ) : processedFiles.length === 0 ? (
            <div className="empty-state glass-panel">
              <p>
                {activeFolder === 'trash' 
                  ? 'Recycle Bin is empty.' 
                  : search 
                    ? `No files matched "${search}".` 
                    : 'This folder is empty.'}
              </p>
              {!search && activeFolder !== 'trash' && (
                <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowUpload(true)}>
                  Upload your first file
                </button>
              )}
            </div>
          ) : (
            <div className="file-list">
              {processedFiles.map((file) => (
                <FileItem key={file._id} file={file} onDelete={handleDelete} onUpdate={handleUpdate} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── New Folder Creation Popover ─────────────────── */}
      {showFolderModal && (
        <div className="modal-overlay" onClick={() => setShowFolderModal(false)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Folder</h3>
              <button className="modal-close" onClick={() => setShowFolderModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label">Folder Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter name (e.g. Work Documents)"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  required
                  autoFocus
                  disabled={creatingFolder}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline w-full" type="button" onClick={() => setShowFolderModal(false)} disabled={creatingFolder}>Cancel</button>
                <button className="btn btn-primary w-full" type="submit" disabled={creatingFolder}>
                  {creatingFolder ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload files modal */}
      {showUpload && (
        <UploadModal
          currentFolderId={currentFolderId} // binds uploads inside current directory!
          onClose={() => setShowUpload(false)}
          onUploadSuccess={() => { setShowUpload(false); loadAll(); }}
        />
      )}
      
      {/* Profile/Settings settings panel */}
      {showProfile && <ProfileSection onClose={() => setShowProfile(false)} />}
    </div>
  );
};

export default Dashboard;
