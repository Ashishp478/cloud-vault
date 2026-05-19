import axios from 'axios';

const getBaseURL = () => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5000/api';
  }
  return import.meta.env.VITE_API_URL || 'https://cloud-vault-9bfj.onrender.com/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth ──────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data);
export const login2FA = (tempToken, code) => api.post('/auth/login-2fa', { tempToken, code });
export const register = (data) => api.post('/auth/register', data);
export const getProfile = () => api.get('/auth/profile');
export const updatePassword = (currentPassword, newPassword) => api.put('/auth/profile/password', { currentPassword, newPassword });

// Two-Factor Authentication (OTP)
export const setup2FA = () => api.post('/auth/setup-2fa');
export const verify2FA = (code) => api.post('/auth/verify-2fa', { code });
export const disable2FA = () => api.post('/auth/disable-2fa');

// Password Reset via Email
export const forgotPassword = (email) => api.post('/auth/forgot-password', { email });
export const resetPassword = (token, password) => api.post('/auth/reset-password', { token, password });

// ── Files ─────────────────────────────────────────────
export const fetchFiles = (folderId, tag) => 
  api.get('/files', { params: { folderId, tag } });

export const uploadFile = (formData, onProgress) =>
  api.post('/files', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  });

export const deleteFile = (id) => api.delete(`/files/${id}`);
export const renameFile = (id, newName) => api.put(`/files/${id}/rename`, { newName });
export const toggleFavorite = (id) => api.put(`/files/${id}/favorite`);
export const shareFile = (id, expiry) => api.post(`/files/${id}/share`, { expiry });
export const downloadFile = (id, stream = false) => 
  api.get(`/files/${id}/download`, { 
    params: { stream },
    responseType: stream ? 'blob' : 'json'
  });

// Recycle Bin Actions
export const fetchTrash = () => api.get('/files/trash');
export const restoreFile = (id) => api.put(`/files/${id}/restore`);
export const permanentlyDeleteFile = (id) => api.delete(`/files/${id}/permanent`);

// File Tag Operations
export const updateFileTags = (id, tags) => api.put(`/files/${id}/tags`, { tags });

// File Versioning Actions
export const downloadVersion = (id, versionKey, stream = false) => 
  api.get(`/files/${id}/versions/${versionKey}/download`, { 
    params: { stream },
    responseType: stream ? 'blob' : 'json'
  });
export const restoreVersion = (id, versionKey) => 
  api.post(`/files/${id}/versions/${versionKey}/restore`);

// AI Operations
export const summarizeFile = (id) => api.post(`/files/${id}/summarize`);
export const ocrFile = (id) => api.post(`/files/${id}/ocr`);
export const fetchAISearch = (q) => api.get('/files/ai-search', { params: { q } });

// ── Folders ───────────────────────────────────────────
export const fetchFolders = (parent) => api.get('/folders', { params: { parent } });
export const createFolder = (name, parent) => api.post('/folders', { name, parent });
export const deleteFolder = (id) => api.delete(`/folders/${id}`);

// ── Stats & Activity ──────────────────────────────────
export const fetchStats = () => api.get('/files/stats');
export const fetchActivities = () => api.get('/files/activities');
export const searchFiles = (q, folder) =>
  api.get('/files/search', { params: { q, folder } });

export default api;
