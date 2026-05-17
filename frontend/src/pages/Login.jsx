import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login, login2FA, forgotPassword } from '../api';
import { Cloud, Lock, Mail, ShieldAlert, ArrowLeft } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  // 2FA login states
  const [require2FA, setRequire2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  
  // Forgot password states
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { addToast } = useToast();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login({ email, password });
      
      if (res.data.require2FA) {
        setTempToken(res.data.tempToken);
        setRequire2FA(true);
        addToast('Verification code required', 'info');
      } else {
        localStorage.setItem('token', res.data.token);
        addToast('Logged in successfully!', 'success');
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login2FA(tempToken, otpCode);
      localStorage.setItem('token', res.data.token);
      addToast('Logged in successfully!', 'success');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(forgotEmail);
      setForgotSent(true);
      addToast('Reset email sent', 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send reset link');
    } finally {
      setLoading(false);
    }
  };

  const resetAllStates = () => {
    setRequire2FA(false);
    setShowForgot(false);
    setForgotSent(false);
    setError('');
    setEmail('');
    setPassword('');
    setForgotEmail('');
    setOtpCode('');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Cloud size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
          <h2 className="text-gradient">
            {require2FA ? 'Security Code' : showForgot ? 'Reset Password' : 'Welcome Back'}
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {require2FA 
              ? 'Enter the code from your Authenticator' 
              : showForgot 
                ? 'Send a secure recovery link' 
                : 'Sign in to Cloud Vault'}
          </p>
        </div>

        {error && (
          <div style={{ color: 'var(--error)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {/* 1. TWO-FACTOR SECURITY INPUT SCREEN */}
        {require2FA && (
          <form onSubmit={handle2FAVerify} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label className="input-label">Verification Code (OTP)</label>
              <div style={{ position: 'relative' }}>
                <ShieldAlert size={18} style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ paddingLeft: '2.5rem', textAlign: 'center', letterSpacing: '0.2em', fontSize: '1.2rem', fontWeight: 'bold' }}
                  placeholder="000000"
                  maxLength={6}
                  value={otpCode} 
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} 
                  required 
                  autoFocus
                  disabled={loading}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
            
            <button type="button" className="btn btn-ghost" onClick={resetAllStates} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <ArrowLeft size={16} /> Back to Sign In
            </button>
          </form>
        )}

        {/* 2. FORGOT PASSWORD TRIGGER SCREEN */}
        {!require2FA && showForgot && (
          <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {forgotSent ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <p style={{ color: 'var(--text-primary)', marginBottom: '1rem', fontSize: '0.95rem' }}>
                  If an account exists with <strong>{forgotEmail}</strong>, we have dispatched a password recovery link!
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  (Note: In local development, check your backend console terminal to retrieve the reset URL instantly!)
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="input-label">Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                      type="email" 
                      className="input-field" 
                      style={{ paddingLeft: '2.5rem' }}
                      placeholder="name@example.com"
                      value={forgotEmail} 
                      onChange={(e) => setForgotEmail(e.target.value)} 
                      required 
                      disabled={loading}
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
                  {loading ? 'Sending…' : 'Send Recovery Link'}
                </button>
              </>
            )}

            <button type="button" className="btn btn-ghost" onClick={resetAllStates} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <ArrowLeft size={16} /> Back to Sign In
            </button>
          </form>
        )}

        {/* 3. NORMAL PASSWORD LOGIN SCREEN */}
        {!require2FA && !showForgot && (
          <>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label className="input-label">Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input 
                    type="email" 
                    className="input-field" 
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="name@example.com"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="input-label" style={{ marginBottom: 0 }}>Password</label>
                  <button type="button" className="btn-link" onClick={() => setShowForgot(true)} style={{ fontSize: '0.8rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)' }}>
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: 'relative', marginTop: '0.35rem' }}>
                  <Lock size={18} style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input 
                    type="password" 
                    className="input-field" 
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="••••••••"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                    disabled={loading}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
                {loading ? 'Signing In…' : 'Sign In'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Don't have an account? <Link to="/register">Create one</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
