import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, CloudUpload, FolderOpen, Shield, Lock, Eye, EyeOff } from 'lucide-react';
import { uploadFile } from '../api';
import { useToast } from '../context/ToastContext';

const FOLDERS = ['Documents', 'Images', 'Videos', 'Others'];

// ── Web Crypto API AES-GCM 256 Encryption Routine ────────────────────────────
const encryptFileInBrowser = async (file, passphrase) => {
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  
  // 1. Generate a random 16-byte salt
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  
  // 2. Derive key from passphrase
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
    ['encrypt']
  );
  
  // 3. Generate a random 12-byte initialization vector (IV)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  // 4. Encrypt the file data
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    fileBytes
  );
  
  // 5. Combine: 16-byte salt + 12-byte IV + encrypted data
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + encryptedContent.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(encryptedContent), salt.byteLength + iv.byteLength);
  
  // 6. Return as a new File object preserving the original name
  return new File([combined], file.name, { type: file.type });
};

const UploadModal = ({ onClose, onUploadSuccess, currentFolderId }) => {
  const [files, setFiles] = useState([]);
  const [folder, setFolder] = useState('Others');
  
  // Encryption states
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { addToast } = useToast();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => setFiles((prev) => [...prev, ...accepted]),
    multiple: true,
  });

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleUpload = async () => {
    if (!files.length) return;

    if (isEncrypted && !passphrase) {
      addToast('Please enter an encryption passphrase.', 'error');
      return;
    }

    setUploading(false);
    setProgress(0);
    setUploading(true);

    try {
      let activeIndex = 0;
      for (const file of files) {
        let uploadPayload = file;

        // Perform browser-side E2E encryption if selected!
        if (isEncrypted) {
          try {
            uploadPayload = await encryptFileInBrowser(file, passphrase);
          } catch (encErr) {
            console.error('Encryption failed:', encErr);
            addToast(`Encryption failed for "${file.name}"`, 'error');
            continue;
          }
        }

        const formData = new FormData();
        formData.append('file', uploadPayload);
        formData.append('folder', folder);
        
        // Custom Google Drive folders path
        if (currentFolderId) {
          formData.append('folderId', currentFolderId);
        }

        // Send encryption flag to the backend
        if (isEncrypted) {
          formData.append('isEncrypted', 'true');
        }

        // Upload single file with progress update
        await uploadFile(formData, (percent) => {
          // Average progress computation for multi-file upload
          const totalProgress = Math.round(((activeIndex + percent / 100) / files.length) * 100);
          setProgress(totalProgress);
        });

        addToast(
          isEncrypted 
            ? `"${file.name}" encrypted & uploaded successfully!` 
            : `"${file.name}" uploaded successfully!`, 
          'success'
        );
        activeIndex++;
      }

      onUploadSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.message || 'Failed to complete files upload.', 'error');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload Files</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Drop Zone */}
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}>
          <input {...getInputProps()} />
          <CloudUpload size={40} color="var(--primary)" />
          <p className="dropzone-text">
            {isDragActive ? 'Drop files here…' : 'Drag & drop files here, or click to select'}
          </p>
          <p className="dropzone-hint">Supports all file types (Multi-upload active)</p>
        </div>

        {/* Folder Selector */}
        <div className="upload-row" style={{ marginBottom: '0.75rem' }}>
          <FolderOpen size={16} color="var(--primary)" />
          <label className="upload-label">Category View:</label>
          <select className="upload-select" value={folder} onChange={(e) => setFolder(e.target.value)}>
            {FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* Client-Side Encryption Panel */}
        <div style={{ background: 'rgba(108, 99, 255, 0.05)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={18} color="var(--primary)" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Zero-Knowledge E2E Encryption</span>
            </div>
            <input 
              type="checkbox" 
              checked={isEncrypted} 
              onChange={(e) => setIsEncrypted(e.target.checked)}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
          </div>

          {isEncrypted && (
            <div style={{ marginTop: '0.75rem', position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', top: '50%', left: '0.75rem', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type={showPass ? 'text' : 'password'}
                className="form-input"
                style={{ paddingLeft: '2.2rem', paddingRight: '2.5rem', fontSize: '0.85rem', height: '36px' }}
                placeholder="Enter passphrase to encrypt files locally"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', top: '50%', right: '0.75rem', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="upload-file-list" style={{ maxHeight: '120px', overflowY: 'auto' }}>
            {files.map((f, i) => (
              <div key={i} className="upload-file-item">
                <span className="upload-file-name" style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span className="upload-file-size" style={{ marginLeft: '1rem', marginRight: '0.5rem' }}>{formatSize(f.size)}</span>
                <button className="upload-file-remove" onClick={() => removeFile(i)}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {uploading && (
          <div className="progress-bar-wrap" style={{ marginTop: '1rem' }}>
            <div className="progress-bar" style={{ width: `${progress}%` }} />
            <span className="progress-label" style={{ right: '10px', top: '50%', transform: 'translateY(-50%)', position: 'absolute', fontSize: '0.75rem', fontWeight: 'bold' }}>{progress}%</span>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={uploading}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!files.length || uploading}
          >
            {uploading ? 'Uploading…' : `Upload ${files.length ? `(${files.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
