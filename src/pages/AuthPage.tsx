import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Layers,
  LogIn,
  UserPlus,
  Lock,
  Mail,
  User,
  Shield,
  Sun,
  Orbit,
  KeyRound,
} from 'lucide-react';
import { UserProfile } from '../types';
import { setStoredAuthToken } from '../api';

interface AuthPageProps {
  themeMode: 'clay' | 'liquid-glass';
  onChangeTheme: (mode: 'clay' | 'liquid-glass') => void;
  onAuthSuccess: (user: UserProfile, token: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  themeMode,
  onChangeTheme,
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login form state
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [seedStarterCorpus, setSeedStarterCorpus] = useState(true);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password: loginPassword,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.token) {
        setErrorMsg(data.error || 'Sign in failed. Check your credentials.');
        return;
      }
      setStoredAuthToken(data.token);
      onAuthSuccess(data.user, data.token);
    } catch {
      setErrorMsg('Cannot reach the Python RAG backend at localhost:3001.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (regPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          username: username.trim(),
          email: email.trim(),
          password: regPassword,
          seedStarterCorpus,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.token) {
        setErrorMsg(data.error || 'Account registration failed.');
        return;
      }
      setStoredAuthToken(data.token);
      onAuthSuccess(data.user, data.token);
    } catch {
      setErrorMsg('Cannot reach the Python RAG backend at localhost:3001.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Top Floating Theme Toggle */}
      <div
        className="clay-well"
        style={{
          position: 'fixed',
          top: 22,
          right: 28,
          padding: 6,
          borderRadius: 20,
          display: 'flex',
          gap: 6,
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={() => onChangeTheme('clay')}
          className={`clay-btn ${
            themeMode === 'clay' ? 'clay-btn-terracotta' : ''
          }`}
          style={{ padding: '7px 13px', fontSize: '0.74rem' }}
        >
          <Sun size={13} />
          <span>CLAY</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeTheme('liquid-glass')}
          className={`clay-btn ${
            themeMode === 'liquid-glass' ? 'clay-btn-cobalt' : ''
          }`}
          style={{ padding: '7px 13px', fontSize: '0.74rem' }}
        >
          <Orbit size={13} />
          <span>LIQUID GLASS</span>
        </button>
      </div>

      {/* Centered Multi-Tenant Auth Slab */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="clay-card"
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '34px 36px',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 18,
              backgroundColor: 'var(--clay-terracotta)',
              color: '#FAF6F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-clay-terracotta)',
              flexShrink: 0,
            }}
          >
            <Layers size={26} />
          </div>
          <div>
            <h1
              className="font-display"
              style={{ fontSize: '1.48rem', fontWeight: 700 }}
            >
              CLAYRAG WORKSPACE
            </h1>
            <div
              className="font-mono"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--ink-muted)',
              }}
            >
              ISOLATED MULTI-USER AGENTIC RAG &amp; SQLITE VAULT
            </div>
          </div>
        </div>

        {/* Sign In / Create Account Mode Switcher */}
        <div
          className="clay-well"
          style={{
            padding: 6,
            borderRadius: 20,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 22,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`clay-btn ${
              mode === 'login' ? 'clay-btn-terracotta' : ''
            }`}
            style={{ padding: '11px 14px', fontSize: '0.84rem' }}
          >
            <LogIn size={15} />
            <span>SIGN IN</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
            }}
            className={`clay-btn ${
              mode === 'register' ? 'clay-btn-terracotta' : ''
            }`}
            style={{ padding: '11px 14px', fontSize: '0.84rem' }}
          >
            <UserPlus size={15} />
            <span>CREATE ACCOUNT</span>
          </button>
        </div>

        {errorMsg && (
          <div
            className="clay-card-alt"
            style={{
              marginBottom: 18,
              padding: '12px 16px',
              borderColor: 'var(--clay-terracotta)',
              color: 'var(--ink-primary)',
              fontSize: '0.84rem',
              fontWeight: 600,
            }}
          >
            {errorMsg}
          </div>
        )}

        {mode === 'login' ? (
          <form
            onSubmit={handleLogin}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div>
              <label
                className="font-mono"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <User size={13} />
                <span>USERNAME OR EMAIL</span>
              </label>
              <input
                type="text"
                required
                className="clay-input"
                placeholder="Enter username or email (e.g. admin)"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>

            <div>
              <label
                className="font-mono"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <Lock size={13} />
                <span>PASSWORD</span>
              </label>
              <input
                type="password"
                required
                className="clay-input"
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ y: 2 }}
              type="submit"
              disabled={isSubmitting}
              className="clay-btn clay-btn-terracotta liquid-orb-send-btn"
              style={{ width: '100%', padding: '14px 20px', marginTop: 4 }}
            >
              <LogIn size={16} />
              <span>
                {isSubmitting ? 'AUTHENTICATING...' : 'SIGN IN TO MY WORKSPACE'}
              </span>
            </motion.button>

            {/* Quick Existing Demo Account Helper */}
            <div
              className="clay-card-alt"
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
                <strong>Existing Demo Account:</strong>{' '}
                <code className="font-mono">admin</code> /{' '}
                <code className="font-mono">admin123</code>
              </div>
              <button
                type="button"
                className="clay-btn"
                style={{ padding: '5px 11px', fontSize: '0.72rem' }}
                onClick={() => {
                  setIdentifier('admin');
                  setLoginPassword('admin123');
                }}
              >
                <KeyRound size={12} />
                <span>AUTO-FILL DEMO</span>
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={handleRegister}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div className="grid-2" style={{ gap: 12 }}>
              <div>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 5,
                  }}
                >
                  DISPLAY NAME
                </label>
                <input
                  type="text"
                  required
                  className="clay-input"
                  placeholder="Alex Rivera"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 5,
                  }}
                >
                  USERNAME
                </label>
                <input
                  type="text"
                  required
                  className="clay-input font-mono"
                  placeholder="alex_rag"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label
                className="font-mono"
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 5,
                }}
              >
                <Mail size={12} />
                <span>EMAIL ADDRESS</span>
              </label>
              <input
                type="email"
                required
                className="clay-input"
                placeholder="alex@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid-2" style={{ gap: 12 }}>
              <div>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 5,
                  }}
                >
                  PASSWORD (MIN 6 CHARS)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="clay-input"
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 5,
                  }}
                >
                  CONFIRM PASSWORD
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="clay-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <div
              className="clay-card-alt"
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div
                  className="font-display"
                  style={{ fontSize: '0.84rem', fontWeight: 700 }}
                >
                  Initialize with Starter RAG Technical Corpus
                </div>
                <div
                  style={{ fontSize: '0.73rem', color: 'var(--ink-secondary)' }}
                >
                  Loads 3 sample documents into your isolated vector vault
                </div>
              </div>
              <div
                className={`clay-switch ${seedStarterCorpus ? 'on' : ''}`}
                onClick={() => setSeedStarterCorpus(!seedStarterCorpus)}
              >
                <div className="clay-switch-knob" />
              </div>
            </div>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ y: 2 }}
              type="submit"
              disabled={isSubmitting}
              className="clay-btn clay-btn-terracotta liquid-orb-send-btn"
              style={{ width: '100%', padding: '14px 20px', marginTop: 4 }}
            >
              <UserPlus size={16} />
              <span>
                {isSubmitting
                  ? 'CREATING ISOLATED WORKSPACE...'
                  : 'CREATE ACCOUNT & LAUNCH STUDIO'}
              </span>
            </motion.button>
          </form>
        )}

        <div
          style={{
            marginTop: 20,
            paddingTop: 14,
            borderTop: '1.5px solid var(--clay-border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: '0.74rem',
            color: 'var(--ink-muted)',
          }}
          className="font-mono"
        >
          <Shield size={13} />
          <span>PBKDF2-SHA256 SALTED AUTH • PER-USER SQLITE3 VECTOR ISOLATION</span>
        </div>
      </motion.div>
    </div>
  );
};
