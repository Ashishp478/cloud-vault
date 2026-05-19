import React, { useState, useEffect } from 'react';
import { User, Lock, LogOut, X, Save, ShieldAlert, KeyRound, Check } from 'lucide-react';
import { getProfile, updatePassword, setup2FA, verify2FA, disable2FA } from '../api';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';

const ProfileSection = ({ onClose }) => {
  const [profile, setProfile] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  
  // 2FA Setup states
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifying2FA, setVerifying2FA] = useState(false);

  const { addToast } = useToast();
  const navigate = useNavigate();

  const fetchUserProfile = async () => {
    try {
      const { data } = await getProfile();
      setProfile(data);
      setTwoFactorEnabled(data.twoFactorEnabled);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      addToast('Current password is required', 'error');
      return;
    }
    if (!password || password !== confirm) {
      addToast(password !== confirm ? 'Passwords do not match' : 'New password is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await updatePassword(currentPassword, password);
      addToast('Password updated successfully!', 'success');
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update password', 'error');
    }
    setSaving(false);
  };

  // ── 2FA Initiation ───────────────────────────────────
  const handleInitiate2FA = async () => {
    setVerifying2FA(true);
    try {
      const res = await setup2FA();
      setQrCode(res.data.qrCode);
      setSecretCode(res.data.secret);
      setShowSetup(true);
      addToast('Scan the QR code to set up 2FA', 'info');
    } catch (err) {
      addToast(err.response?.data?.message || 'Could not initiate 2FA setup', 'error');
    } finally {
      setVerifying2FA(false);
    }
  };

  // ── 2FA Verification ─────────────────────────────────
  const handleVerify2FA = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      addToast('Please enter a valid 6-digit code', 'error');
      return;
    }
    setVerifying2FA(true);
    try {
      await verify2FA(otpCode);
      setTwoFactorEnabled(true);
      setShowSetup(false);
      setOtpCode('');
      addToast('Two-Factor Authentication is active!', 'success');
      fetchUserProfile(); // Refresh profile state
    } catch (err) {
      addToast(err.response?.data?.message || 'Invalid verification code', 'error');
    } finally {
      setVerifying2FA(false);
    }
  };

  // ── 2FA Disable ──────────────────────────────────────
  const handleDisable2FA = async () => {
    if (!window.confirm('Are you sure you want to disable 2FA? This will make your account less secure.')) {
      return;
    }
    setVerifying2FA(true);
    try {
      await disable2FA();
      setTwoFactorEnabled(false);
      addToast('Two-Factor Authentication disabled.', 'info');
      fetchUserProfile();
    } catch (err) {
      addToast(err.response?.data?.message || 'Could not disable 2FA', 'error');
    } finally {
      setVerifying2FA(false);
    }
  };

  const initials = profile?.email?.slice(0, 2).toUpperCase() || '??';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-sm" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Avatar */}
        <div className="profile-avatar-row" style={{ marginBottom: '1.5rem' }}>
          <div className="profile-avatar">{initials}</div>
          <div>
            <div className="profile-email">{profile?.email || '…'}</div>
            <div className="profile-since">Member since {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '…'}</div>
          </div>
        </div>

        {/* Two-Factor Authentication Section */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <KeyRound size={18} color="var(--primary)" />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Two-Factor Security</h4>
          </div>

          {twoFactorEnabled ? (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
                🟢 Active: Two-Factor Authentication is currently securing your account.
              </p>
              <button className="btn btn-danger w-full" onClick={handleDisable2FA} disabled={verifying2FA}>
                Disable 2FA
              </button>
            </div>
          ) : showSetup ? (
            <form onSubmit={handleVerify2FA}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
                Scan this QR code in Google Authenticator or Authy to configure OTP.
              </p>
              <img src={qrCode} alt="2FA QR Code" style={{ width: '130px', height: '130px', display: 'block', margin: '0 auto 1rem auto', borderRadius: '8px', border: '4px solid white' }} />
              <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem', wordBreak: 'break-all' }}>
                Key: <strong style={{ color: 'var(--text-primary)' }}>{secretCode}</strong>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ textAlign: 'center', letterSpacing: '0.2em', fontWeight: 'bold' }}
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline w-full" type="button" onClick={() => setShowSetup(false)}>Cancel</button>
                <button className="btn btn-primary w-full" type="submit" disabled={verifying2FA}>
                  <Check size={14} style={{ marginRight: '0.25rem' }} /> Activate
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
                🔴 Inactive: Secure your drive with a 6-digit login verification step.
              </p>
              <button className="btn btn-primary w-full" onClick={handleInitiate2FA} disabled={verifying2FA}>
                Setup 2FA OTP
              </button>
            </div>
          )}
        </div>

        {/* Change password */}
        <form className="profile-form" onSubmit={handlePassword} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Lock size={16} color="var(--primary)" />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Update Password</h4>
          </div>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="input-label">Current Password</label>
            <input
              type="password"
              className="form-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="input-label">New Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="input-label">Confirm Password</label>
            <input
              type="password"
              className="form-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              required
            />
          </div>
          <button className="btn btn-primary w-full" type="submit" disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : 'Update Credentials'}
          </button>
        </form>

        <button className="btn btn-danger w-full" style={{ marginTop: '0.5rem' }} onClick={handleLogout}>
          <LogOut size={15} /> Logout Account
        </button>
      </div>
    </div>
  );
};

export default ProfileSection;
