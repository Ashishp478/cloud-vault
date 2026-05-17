import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import axios from 'axios';
import {
  FileText, Image, Film, File, Star, Trash2, Pencil, Share2, 
  Download, Check, X, Copy, Eye, ShieldAlert, Sparkles, 
  RotateCcw, History, Tag, FileCheck, EyeOff, Lock
} from 'lucide-react';
import { 
  deleteFile, renameFile, toggleFavorite, shareFile, downloadFile, 
  restoreFile, permanentlyDeleteFile, updateFileTags, downloadVersion, 
  restoreVersion, summarizeFile, ocrFile 
} from '../api';
import { useToast } from '../context/ToastContext';

const EXPIRY_OPTIONS = [
  { label: '1 Hour', value: 1 },
  { label: '24 Hours', value: 24 },
  { label: '7 Days', value: 168 },
];

const TAG_COLORS = {
  Work: 'tag-work',
  College: 'tag-college',
  Personal: 'tag-personal',
};

const getFileIcon = (mimeType = '') => {
  if (mimeType.startsWith('image/')) return <Image size={20} className="file-icon icon-image" />;
  if (mimeType.startsWith('video/')) return <Film size={20} className="file-icon icon-video" />;
  if (mimeType.includes('pdf')) return <FileText size={20} className="file-icon icon-pdf" />;
  return <File size={20} className="file-icon icon-default" />;
};

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// ── Web Crypto API AES-GCM 256 Decryption Routine ────────────────────────────
const decryptFileInBrowser = async (encryptedBlob, passphrase) => {
  const bytes = new Uint8Array(await encryptedBlob.arrayBuffer());
  
  // Slice out: 16-byte salt, 12-byte IV, and remaining ciphertext
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const encryptedData = bytes.slice(28);
  
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encryptedData
  );
  
  return new Blob([decrypted]);
};

const FileItem = ({ file, onDelete, onUpdate }) => {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(file.originalName);
  
  // Standard modals
  const [showShare, setShowShare] = useState(false);
  const [shareExpiry, setShareExpiry] = useState(24);
  const [shareUrl, setShareUrl] = useState('');
  
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  // Zero-Knowledge Decryption states
  const [showDecryptPrompt, setShowDecryptPrompt] = useState(false);
  const [decryptPassphrase, setDecryptPassphrase] = useState('');
  const [pendingAction, setPendingAction] = useState(''); // 'download' or 'preview' or 'verDownload'
  const [pendingVerKey, setPendingVerKey] = useState('');
  const [decrypting, setDecrypting] = useState(false);

  // Versions states
  const [showVersions, setShowVersions] = useState(false);
  const [restoringVersionKey, setRestoringVersionKey] = useState('');

  // Tags states
  const [showTags, setShowTags] = useState(false);

  // AI states
  const [summary, setSummary] = useState(file.aiSummary || '');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [ocrText, setOcrText] = useState(file.extractedText || '');
  const [loadingOCR, setLoadingOCR] = useState(false);

  const { addToast } = useToast();

  // ── Rename ──────────────────────────────────────────
  const handleRename = async () => {
    if (!newName.trim() || newName === file.originalName) { setRenaming(false); return; }
    try {
      const { data } = await renameFile(file._id, newName.trim());
      onUpdate(data);
      setRenaming(false);
      addToast('File renamed', 'success');
    } catch { addToast('Rename failed', 'error'); }
  };

  // ── Favorite ─────────────────────────────────────────
  const handleFavorite = async () => {
    try {
      const { data } = await toggleFavorite(file._id);
      onUpdate(data);
    } catch { addToast('Could not update favorite', 'error'); }
  };

  // ── Soft Delete (Trash) ──────────────────────────────
  const handleSoftDelete = async () => {
    try {
      await deleteFile(file._id);
      onDelete(file._id);
      addToast('File moved to Recycle Bin', 'success');
    } catch { addToast('Trash failed', 'error'); }
  };

  // ── Recycle Bin: Restore ──────────────────────────────
  const handleRestore = async () => {
    try {
      await restoreFile(file._id);
      onDelete(file._id); // Remove from current Recycle Bin display
      addToast('File successfully restored!', 'success');
    } catch { addToast('Restore failed', 'error'); }
  };

  // ── Recycle Bin: Permanent Purge ─────────────────────
  const handlePermanentDelete = async () => {
    if (!window.confirm('WARNING: This will permanently purge this file and all its version history from S3 & the Database. This action cannot be undone. Proceed?')) {
      return;
    }
    try {
      await permanentlyDeleteFile(file._id);
      onDelete(file._id);
      addToast('File permanently deleted', 'success');
    } catch { addToast('Permanent purge failed', 'error'); }
  };

  // ── Share ────────────────────────────────────────────
  const handleShare = async () => {
    try {
      const { data } = await shareFile(file._id, shareExpiry);
      setShareUrl(data.url);
    } catch { addToast('Share failed', 'error'); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    addToast('Link copied to clipboard!', 'success');
  };

  // ── Safe Decrypt Action (Zero-Knowledge) ─────────────
  const handleDownloadOrPreview = async (action, verKey = '') => {
    if (file.isEncrypted) {
      setPendingAction(action);
      setPendingVerKey(verKey);
      setShowDecryptPrompt(true);
      return;
    }

    try {
      let downloadUrl = '';
      if (verKey) {
        const { data } = await downloadVersion(file._id, verKey);
        downloadUrl = data.url;
      } else {
        const { data } = await downloadFile(file._id);
        downloadUrl = data.url;
      }

      if (action === 'preview') {
        setPreviewUrl(downloadUrl);
        setShowPreview(true);
      } else {
        window.open(downloadUrl, '_blank');
      }
    } catch { addToast('Operation failed', 'error'); }
  };

  const executeDecryption = async (e) => {
    e.preventDefault();
    if (!decryptPassphrase) {
      addToast('Please enter the decryption passphrase.', 'error');
      return;
    }

    setDecrypting(true);
    try {
      let downloadUrl = '';
      if (pendingAction === 'verDownload') {
        const { data } = await downloadVersion(file._id, pendingVerKey);
        downloadUrl = data.url;
      } else {
        const { data } = await downloadFile(file._id);
        downloadUrl = data.url;
      }

      // 1. Fetch raw binary blob from AWS S3 (pre-signed URL)
      const res = await axios.get(downloadUrl, { responseType: 'blob' });

      // 2. Decrypt locally in browser
      const decryptedBlob = await decryptFileInBrowser(res.data, decryptPassphrase);
      const localUrl = URL.createObjectURL(decryptedBlob);

      addToast('File decrypted successfully!', 'success');
      setShowDecryptPrompt(false);
      setDecryptPassphrase('');

      if (pendingAction === 'preview') {
        setPreviewUrl(localUrl);
        setShowPreview(true);
      } else {
        // Trigger browser file download anchor
        const link = document.createElement('a');
        link.href = localUrl;
        link.download = file.originalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error(err);
      addToast('Decryption failed. Invalid passphrase or corrupted file.', 'error');
    } finally {
      setDecrypting(false);
    }
  };

  // ── Version history: Restore old S3 Key ──────────────
  const handleRestoreVersion = async (verKey) => {
    setRestoringVersionKey(verKey);
    try {
      const { data } = await restoreVersion(file._id, verKey);
      onUpdate(data);
      setShowVersions(false);
      addToast('Version restored to active state!', 'success');
    } catch (err) {
      addToast('Version restoration failed', 'error');
    } finally {
      setRestoringVersionKey('');
    }
  };

  // ── Tags management toggles ───────────────────────────
  const handleTagToggle = async (tag) => {
    const isPresent = file.tags?.includes(tag);
    const updatedTags = isPresent 
      ? file.tags.filter(t => t !== tag) 
      : [...(file.tags || []), tag];
      
    try {
      const { data } = await updateFileTags(file._id, updatedTags);
      onUpdate(data);
    } catch (err) {
      addToast('Tag update failed', 'error');
    }
  };

  // ── AI PDF Summary Drawer ──────────────────────────────
  const handleSummarize = async () => {
    if (summary) {
      setSummary(''); // Toggle display
      return;
    }
    setLoadingSummary(true);
    try {
      const { data } = await summarizeFile(file._id);
      setSummary(data.aiSummary);
      addToast('AI Summary generated successfully!', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'AI summarization failed.', 'error');
    } finally {
      setLoadingSummary(false);
    }
  };

  // ── AI Image OCR text transcription ────────────────────
  const handleOCR = async () => {
    if (ocrText) {
      setOcrText(''); // Toggle display
      return;
    }
    setLoadingOCR(true);
    try {
      const { data } = await ocrFile(file._id);
      setOcrText(data.extractedText);
      addToast('AI Image OCR text extracted!', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'AI OCR failed.', 'error');
    } finally {
      setLoadingOCR(false);
    }
  };

  const isImage = file.mimeType?.startsWith('image/');
  const isPdf = file.mimeType?.includes('pdf');
  const canPreview = (isImage || isPdf) && !file.isTrashed;
  const versionsCount = file.versions?.length || 0;

  return (
    <>
      <div className={`file-item ${file.isFavorite ? 'file-item-fav' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Thumbnail / Icon */}
          <div className="file-thumb">
            {getFileIcon(file.mimeType)}
          </div>

          {/* Name & metadata details */}
          <div className="file-info" style={{ flex: 1 }}>
            {renaming ? (
              <div className="rename-row">
                <input
                  className="rename-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
                  autoFocus
                />
                <button className="icon-btn btn-success" onClick={handleRename}><Check size={14} /></button>
                <button className="icon-btn btn-ghost" onClick={() => setRenaming(false)}><X size={14} /></button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="file-name">{file.originalName}</span>
                {file.isEncrypted && <Lock size={13} color="var(--primary)" style={{ marginLeft: '0.4rem' }} title="Encrypted" />}
                {versionsCount > 0 && (
                  <span className="version-badge" onClick={() => setShowVersions(true)} title="Click to view history">
                    v{versionsCount + 1}
                  </span>
                )}
              </div>
            )}
            <div className="file-meta">
              <span>{formatSize(file.size)}</span>
              <span>·</span>
              <span>{file.folder || 'Others'}</span>
              <span>·</span>
              <span>{formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}</span>
            </div>

            {/* Display attached tags */}
            {file.tags && file.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem' }}>
                {file.tags.map(t => (
                  <span key={t} className={`tag-badge ${TAG_COLORS[t]}`}>{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="file-actions">
            {/* 1. RECYCLE BIN LAYOUT */}
            {file.isTrashed ? (
              <>
                <button className="icon-btn btn-success" onClick={handleRestore} title="Restore File">
                  <RotateCcw size={16} />
                </button>
                <button className="icon-btn btn-danger" onClick={handlePermanentDelete} title="Purge Permanently">
                  <Trash2 size={16} />
                </button>
              </>
            ) : (
              /* 2. ACTIVE FILES LAYOUT */
              <>
                {/* AI capabilities */}
                {isPdf && (
                  <button className="icon-btn btn-ghost" onClick={handleSummarize} disabled={loadingSummary} title="AI Summary (Gemini)">
                    <Sparkles size={16} color="#8E2DE2" />
                  </button>
                )}
                {isImage && (
                  <button className="icon-btn btn-ghost" onClick={handleOCR} disabled={loadingOCR} title="AI Image OCR (Gemini)">
                    <Sparkles size={16} color="#00C9A7" />
                  </button>
                )}

                <button
                  className={`icon-btn ${file.isFavorite ? 'btn-star-active' : 'btn-ghost'}`}
                  onClick={handleFavorite}
                  title="Favorite"
                >
                  <Star size={16} fill={file.isFavorite ? 'currentColor' : 'none'} />
                </button>

                <button className="icon-btn btn-ghost" onClick={() => setShowTags(!showTags)} title="Manage Tags">
                  <Tag size={16} />
                </button>

                {canPreview && (
                  <button className="icon-btn btn-ghost" onClick={() => handleDownloadOrPreview('preview')} title="Preview">
                    <Eye size={16} />
                  </button>
                )}

                <button className="icon-btn btn-ghost" onClick={() => handleDownloadOrPreview('download')} title="Download">
                  <Download size={16} />
                </button>

                <button className="icon-btn btn-ghost" onClick={() => setRenaming(true)} title="Rename">
                  <Pencil size={16} />
                </button>

                <button className="icon-btn btn-ghost" onClick={() => { setShowShare(true); setShareUrl(''); }} title="Share">
                  <Share2 size={16} />
                </button>

                <button className="icon-btn btn-danger" onClick={handleSoftDelete} title="Move to Recycle Bin">
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* AI Cache Summaries & OCR results panel */}
        {(summary || loadingSummary) && (
          <div className="ai-card">
            <div className="ai-card-title">
              <Sparkles size={15} color="#8E2DE2" /> AI Summary (Gemini 2.0 Flash)
            </div>
            {loadingSummary ? 'Parsing PDF & compiling summaries…' : (
              <div style={{ whiteSpace: 'pre-line' }}>{summary}</div>
            )}
          </div>
        )}

        {(ocrText || loadingOCR) && (
          <div className="ai-card">
            <div className="ai-card-title">
              <Sparkles size={15} color="#00C9A7" /> Extracted Text (Gemini OCR)
            </div>
            {loadingOCR ? 'Analyzing image details…' : (
              <div style={{ fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px', whiteSpace: 'pre-line' }}>{ocrText}</div>
            )}
          </div>
        )}

        {/* Tags Selection Bar dropdown */}
        {showTags && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.8rem', alignSelf: 'center', marginRight: '0.5rem' }}>Select tags:</span>
            {['Work', 'College', 'Personal'].map(tag => {
              const active = file.tags?.includes(tag);
              return (
                <button
                  key={tag}
                  className={`tag-pill ${active ? 'active' : ''}`}
                  onClick={() => handleTagToggle(tag)}
                  style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Zero-Knowledge Passphrase Dialog */}
      {showDecryptPrompt && (
        <div className="modal-overlay" onClick={() => setShowDecryptPrompt(false)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={18} color="var(--primary)" /> Decrypt Vault File
              </h3>
              <button className="modal-close" onClick={() => setShowDecryptPrompt(false)}><X size={18} /></button>
            </div>
            <form onSubmit={executeDecryption}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                This file is encrypted client-side. Please enter the secret passphrase to decrypt and retrieve it.
              </p>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter decryption passphrase"
                  value={decryptPassphrase}
                  onChange={(e) => setDecryptPassphrase(e.target.value)}
                  required
                  autoFocus
                  disabled={decrypting}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline w-full" type="button" onClick={() => setShowDecryptPrompt(false)} disabled={decrypting}>Cancel</button>
                <button className="btn btn-primary w-full" type="submit" disabled={decrypting}>
                  {decrypting ? 'Decrypting…' : 'Decrypt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Link Generation Modal */}
      {showShare && (
        <div className="modal-overlay" onClick={() => setShowShare(false)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Share "{file.originalName}"</h3>
              <button className="modal-close" onClick={() => setShowShare(false)}><X size={18} /></button>
            </div>
            <div className="share-expiry-row">
              <label className="upload-label">Link expires in:</label>
              <select className="upload-select" value={shareExpiry} onChange={(e) => setShareExpiry(Number(e.target.value))}>
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {shareUrl ? (
              <div className="share-url-box">
                <input className="share-url-input" readOnly value={shareUrl} />
                <button className="btn btn-primary" onClick={copyLink}><Copy size={15} /> Copy</button>
              </div>
            ) : (
              <button className="btn btn-primary w-full" onClick={handleShare}>
                <Share2 size={16} /> Generate Link
              </button>
            )}
          </div>
        </div>
      )}

      {/* Version History Popover Modal */}
      {showVersions && (
        <div className="modal-overlay" onClick={() => setShowVersions(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={18} color="var(--primary)" /> Version History
              </h3>
              <button className="modal-close" onClick={() => setShowVersions(false)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Historical versions uploaded to the drive. You can download older copies or roll back the current file.
            </p>

            <div className="version-history-list">
              {/* Active Version */}
              <div className="version-history-item" style={{ borderLeft: '3px solid var(--primary)', background: 'rgba(108, 99, 255, 0.05)' }}>
                <div className="version-history-meta">
                  <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>Version {versionsCount + 1} (Active)</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Uploaded: {new Date(file.createdAt).toLocaleString()} · {formatSize(file.size)}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', paddingRight: '0.5rem' }}>Active</span>
              </div>

              {/* Historical Versions */}
              {file.versions?.slice().reverse().map((ver, idx) => {
                const verNum = versionsCount - idx;
                return (
                  <div key={ver.s3Key} className="version-history-item">
                    <div className="version-history-meta">
                      <span style={{ fontWeight: 'bold' }}>Version {verNum}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Uploaded: {new Date(ver.createdAt).toLocaleString()} · {formatSize(ver.size)}
                      </span>
                    </div>
                    <div className="version-history-actions">
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: '28px' }}
                        onClick={() => handleDownloadOrPreview('verDownload', ver.s3Key)}
                      >
                        Download
                      </button>
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: '28px' }}
                        onClick={() => handleRestoreVersion(ver.s3Key)}
                        disabled={restoringVersionKey === ver.s3Key}
                      >
                        {restoringVersionKey === ver.s3Key ? 'Rolling…' : 'Restore'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* File Previewer Overlay */}
      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close preview-close" onClick={() => setShowPreview(false)}><X size={20} /></button>
            {isImage && <img src={previewUrl} alt={file.originalName} className="preview-image" />}
            {isPdf && <iframe src={previewUrl} className="preview-pdf" title={file.originalName} />}
          </div>
        </div>
      )}
    </>
  );
};

export default FileItem;
