import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Key,
  Cpu,
  HardDrive,
  Sliders,
  Save,
  Lock,
  LogOut,
  Trash2,
  RefreshCw,
  FolderSearch,
  ExternalLink,
  Copy,
  Check,
  Sun,
  Orbit,
  Aperture,
  Server,
  Shield,
} from 'lucide-react';
import {
  ChunkStrategyType,
  ModelPortalCatalogItem,
  OfflineModelFileInfo,
  RagPipelineConfig,
  UserProfile,
} from '../types';
import { authFetch } from '../api';
import { COLOR_PALETTES, ColorPaletteId } from '../themePalettes';

type SettingsTab = 'account' | 'models' | 'apikeys' | 'offline' | 'preferences';

interface SettingsPageProps {
  user: UserProfile;
  config: RagPipelineConfig;
  modelCatalog: ModelPortalCatalogItem[];
  themeMode: 'clay' | 'liquid-glass' | 'vision-ceramic';
  spatialFlow: 'calm' | 'dynamic';
  paletteId: ColorPaletteId;
  onChangeTheme: (mode: 'clay' | 'liquid-glass' | 'vision-ceramic') => void;
  onChangeSpatialFlow: (flow: 'calm' | 'dynamic') => void;
  onChangePalette: (paletteId: ColorPaletteId) => void;
  onUpdateConfig: (partial: Partial<RagPipelineConfig>) => Promise<void>;
  onUserUpdated: (updated: UserProfile) => void;
  onLogout: () => Promise<void>;
  onAccountDeleted: () => void;
}

const PROVIDER_MODELS: Record<string, string[]> = {
  builtin_local: [
    'Qwen2.5-3B-Instruct-Q5_K_M',
    'Phi-3.5-Mini-Instruct-Q4_K_M',
    'Llama-3.1-8B-Instruct-Q4_K_M',
    'Gemma-2-2B-IT-Q8_0',
  ],
  offline_gguf: [
    'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
    'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
  ],
  ollama: ['llama3.1:8b', 'qwen2.5:3b', 'phi3.5:3.8b', 'gemma2:2b', 'mistral:7b'],
  lmstudio: ['qwen2.5-3b-instruct', 'meta-llama-3.1-8b-instruct', 'phi-3.5-mini-instruct'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest'],
  groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  openrouter: [
    'meta-llama/llama-3.1-8b-instruct',
    'qwen/qwen-2.5-7b-instruct',
    'google/gemini-2.5-flash',
  ],
};

export const SettingsPage: React.FC<SettingsPageProps> = ({
  user,
  config,
  modelCatalog,
  themeMode,
  spatialFlow,
  paletteId,
  onChangeTheme,
  onChangeSpatialFlow,
  onChangePalette,
  onUpdateConfig,
  onUserUpdated,
  onLogout,
  onAccountDeleted,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [toast, setToast] = useState<string | null>(null);

  // Account Manager State
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Model Selection & API Keys State
  const [reshaperProvider, setReshaperProvider] = useState(config.reshaperProvider);
  const [reshaperModel, setReshaperModel] = useState(config.reshaperModel);
  const [generatorProvider, setGeneratorProvider] = useState(config.generatorProvider);
  const [generatorModel, setGeneratorModel] = useState(config.generatorModel);
  const [apiKeys, setApiKeys] = useState({
    openai: config.apiKeys.openai || '',
    gemini: config.apiKeys.gemini || '',
    anthropic: config.apiKeys.anthropic || '',
    groq: config.apiKeys.groq || '',
    openrouter: config.apiKeys.openrouter || '',
  });
  const [ollamaUrl, setOllamaUrl] = useState(
    config.localEndpoints.ollamaUrl || 'http://localhost:11434'
  );
  const [lmStudioUrl, setLmStudioUrl] = useState(
    config.localEndpoints.lmStudioUrl || 'http://localhost:1234/v1'
  );

  // Daemon Status & Offline Scanner State
  const [daemonStatus, setDaemonStatus] = useState<{
    ollamaOnline: boolean;
    ollamaModels: string[];
    lmStudioOnline: boolean;
    lmStudioModels: string[];
  } | null>(null);

  const [scanInputPath, setScanInputPath] = useState(config.offlineModelPath || '');
  const [scanResult, setScanResult] = useState<{
    resolvedPath: string;
    exists: boolean;
    isDirectory: boolean;
    modelsFound: OfflineModelFileInfo[];
    commonDirectoriesChecked: Array<{ label: string; path: string; exists: boolean }>;
    message: string;
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const probeLocalDaemons = async () => {
    try {
      const resp = await authFetch('/api/models/probe-local-daemons');
      if (resp.ok) setDaemonStatus(await resp.json());
    } catch {
      // ignore
    }
  };

  const runPathScan = async (pathToScan: string) => {
    setIsScanning(true);
    try {
      const resp = await authFetch('/api/models/scan-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToScan }),
      });
      if (resp.ok) setScanResult(await resp.json());
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    probeLocalDaemons();
    runPathScan(config.offlineModelPath || '');
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    const resp = await authFetch('/api/account/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, username, email }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setAccountError(data.error || 'Failed to update profile.');
      return;
    }
    onUserUpdated(data.user);
    showToast('ACCOUNT PROFILE UPDATED');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    if (newPassword !== confirmNewPassword) {
      setAccountError('New passwords do not match.');
      return;
    }
    const resp = await authFetch('/api/account/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setAccountError(data.error || 'Could not change password.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    showToast('PASSWORD UPDATED SECURELY');
  };

  const handleDeleteAccount = async () => {
    const resp = await authFetch('/api/account', { method: 'DELETE' });
    if (resp.ok) {
      onAccountDeleted();
    }
  };

  const handleSaveModelsAndKeys = async () => {
    await onUpdateConfig({
      reshaperProvider,
      reshaperModel,
      generatorProvider,
      generatorModel,
      apiKeys,
      localEndpoints: { ollamaUrl, lmStudioUrl },
      offlineModelPath: scanInputPath,
    });
    showToast('MODELS & API KEYS SAVED TO YOUR PRIVATE VAULT');
  };

  const copyCommand = (id: string, cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: React.ComponentType<{ size?: number | string }>;
  }> = [
      { id: 'account', label: 'ACCOUNT MANAGER', icon: User },
      { id: 'models', label: 'MODEL SELECTION', icon: Cpu },
      { id: 'apikeys', label: 'API KEYS VAULT', icon: Key },
      { id: 'offline', label: 'OFFLINE GGUF PORTAL', icon: HardDrive },
      { id: 'preferences', label: 'APPEARANCE & DEFAULTS', icon: Sliders },
    ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Settings Sub-Navigation Bar */}
      <div
        className="clay-card"
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tabs.map((tab) => {
            const IconComp = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`clay-btn ${isActive ? 'clay-btn-terracotta' : ''}`}
                style={{ padding: '10px 16px', fontSize: '0.78rem' }}
              >
                <IconComp size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {toast && <span className="clay-tag clay-tag-sage">{toast}</span>}
      </div>

      {/* =====================================================================
          TAB 1: ACCOUNT MANAGER
      ===================================================================== */}
      {activeTab === 'account' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {accountError && (
            <div
              className="clay-card-alt"
              style={{
                borderColor: 'var(--clay-terracotta)',
                fontWeight: 700,
                fontSize: '0.86rem',
              }}
            >
              {accountError}
            </div>
          )}

          <div className="grid-2">
            {/* Left: Profile & Session Identity */}
            <div className="clay-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 18,
                }}
              >
                <span className="clay-tag clay-tag-terracotta">
                  <User size={13} />
                  <span>USER ACCOUNT PROFILE</span>
                </span>
                <span className="clay-tag clay-tag-sage">
                  ROLE: {user.role}
                </span>
              </div>

              <div
                className="clay-well font-mono"
                style={{
                  fontSize: '0.74rem',
                  marginBottom: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div>
                  <strong>Account ID:</strong> {user.userId}
                </div>
                <div>
                  <strong>Member Since:</strong>{' '}
                  {new Date(user.createdAt).toLocaleString()}
                </div>
                {user.lastLoginAt && (
                  <div>
                    <strong>Last Sign In:</strong>{' '}
                    {new Date(user.lastLoginAt).toLocaleString()}
                  </div>
                )}
              </div>

              <form
                onSubmit={handleSaveProfile}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
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
                    className="clay-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
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
                      USERNAME
                    </label>
                    <input
                      type="text"
                      className="clay-input font-mono"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
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
                      EMAIL ADDRESS
                    </label>
                    <input
                      type="email"
                      className="clay-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <button
                    type="submit"
                    className="clay-btn clay-btn-terracotta"
                    style={{ flex: 1 }}
                  >
                    <Save size={15} />
                    <span>SAVE PROFILE CHANGES</span>
                  </button>
                  <button
                    type="button"
                    className="clay-btn"
                    onClick={onLogout}
                  >
                    <LogOut size={15} />
                    <span>SIGN OUT</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Security Password Update & Danger Zone */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="clay-card">
                <span
                  className="clay-tag clay-tag-cobalt"
                  style={{ marginBottom: 16 }}
                >
                  <Lock size={13} />
                  <span>CHANGE ACCOUNT PASSWORD</span>
                </span>

                <form
                  onSubmit={handleChangePassword}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
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
                      CURRENT PASSWORD
                    </label>
                    <input
                      type="password"
                      required
                      className="clay-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
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
                        NEW PASSWORD
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        className="clay-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
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
                        CONFIRM NEW PASSWORD
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        className="clay-input"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="clay-btn clay-btn-sage"
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <Shield size={15} />
                    <span>UPDATE PASSWORD HASH</span>
                  </button>
                </form>
              </div>

              {/* Danger Zone */}
              <div className="clay-card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      className="font-display"
                      style={{ fontSize: '0.96rem', fontWeight: 700 }}
                    >
                      Delete Account &amp; Personal SQLite Vault
                    </div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      Permanently erases your user account, documents, vectors,
                      API keys, and saved findings.
                    </div>
                  </div>

                  {!confirmDeleteOpen ? (
                    <button
                      type="button"
                      className="clay-btn"
                      onClick={() => setConfirmDeleteOpen(true)}
                    >
                      <Trash2 size={14} />
                      <span>DELETE ACCOUNT</span>
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="clay-btn clay-btn-terracotta"
                        onClick={handleDeleteAccount}
                      >
                        CONFIRM PERMANENT DELETE
                      </button>
                      <button
                        type="button"
                        className="clay-btn"
                        onClick={() => setConfirmDeleteOpen(false)}
                      >
                        CANCEL
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: MODEL SELECTION
      ===================================================================== */}
      {activeTab === 'models' && (
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <span className="clay-tag clay-tag-terracotta">
              <Cpu size={14} />
              <span>SWITCHABLE SMALL LLM &amp; SYNTHESIS MODEL ROUTER</span>
            </span>
            <button
              type="button"
              className="clay-btn"
              style={{ padding: '7px 14px', fontSize: '0.75rem' }}
              onClick={probeLocalDaemons}
            >
              <RefreshCw size={13} />
              <span>PROBE LOCAL DAEMONS</span>
            </button>
          </div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            {/* Small LLM Prompt Reshaper */}
            <div className="clay-card-alt">
              <h3
                className="font-display"
                style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: 6 }}
              >
                Stage 01 // Small LLM Prompt Reshaper &amp; HyDE Agent
              </h3>
              <p
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--ink-secondary)',
                  marginBottom: 14,
                }}
              >
                Reshapes user prompts, generates Step-Back abstractions, 3-way
                Sub-Queries, and HyDE dense anchors.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                    RESHAPER PROVIDER
                  </label>
                  <select
                    className="clay-select"
                    value={reshaperProvider}
                    onChange={(e) => {
                      const prov = e.target
                        .value as RagPipelineConfig['reshaperProvider'];
                      setReshaperProvider(prov);
                      const def = PROVIDER_MODELS[prov]?.[0];
                      if (def) setReshaperModel(def);
                    }}
                  >
                    <option value="builtin_local">
                      Built-in Local Micro-Agent (No Key Required)
                    </option>
                    <option value="offline_gguf">
                      Offline Local GGUF / ONNX File
                    </option>
                    <option value="ollama">Ollama Local Runtime</option>
                    <option value="lmstudio">LM Studio / llama.cpp Server</option>
                    <option value="openai">OpenAI API</option>
                    <option value="gemini">Google Gemini API</option>
                    <option value="anthropic">Anthropic Claude API</option>
                    <option value="groq">Groq Fast LPU API</option>
                    <option value="openrouter">OpenRouter Universal API</option>
                  </select>
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
                    SMALL LLM MODEL ID
                  </label>
                  <input
                    type="text"
                    className="clay-input font-mono"
                    value={reshaperModel}
                    onChange={(e) => setReshaperModel(e.target.value)}
                    list="settings-reshaper-models"
                  />
                  <datalist id="settings-reshaper-models">
                    {(PROVIDER_MODELS[reshaperProvider] || []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Grounded Answer Synthesizer */}
            <div className="clay-card-alt">
              <h3
                className="font-display"
                style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: 6 }}
              >
                Stage 06 // Grounded Answer Synthesis &amp; Self-RAG LLM
              </h3>
              <p
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--ink-secondary)',
                  marginBottom: 14,
                }}
              >
                Synthesizes rich cited responses from CRAG-verified chunks and
                audits claim groundedness.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                    SYNTHESIS PROVIDER
                  </label>
                  <select
                    className="clay-select"
                    value={generatorProvider}
                    onChange={(e) => {
                      const prov = e.target
                        .value as RagPipelineConfig['generatorProvider'];
                      setGeneratorProvider(prov);
                      const def = PROVIDER_MODELS[prov]?.[0];
                      if (def) setGeneratorModel(def);
                    }}
                  >
                    <option value="builtin_local">
                      Built-in Grounded Synthesizer (No Key Required)
                    </option>
                    <option value="offline_gguf">
                      Offline Local GGUF / ONNX File
                    </option>
                    <option value="ollama">Ollama Local Runtime</option>
                    <option value="lmstudio">LM Studio / llama.cpp Server</option>
                    <option value="openai">OpenAI API</option>
                    <option value="gemini">Google Gemini API</option>
                    <option value="anthropic">Anthropic Claude API</option>
                    <option value="groq">Groq Fast LPU API</option>
                    <option value="openrouter">OpenRouter Universal API</option>
                  </select>
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
                    SYNTHESIS MODEL ID
                  </label>
                  <input
                    type="text"
                    className="clay-input font-mono"
                    value={generatorModel}
                    onChange={(e) => setGeneratorModel(e.target.value)}
                    list="settings-generator-models"
                  />
                  <datalist id="settings-generator-models">
                    {(PROVIDER_MODELS[generatorProvider] || []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
          </div>

          <div
            className="clay-card-alt"
            style={{
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <span className="font-mono" style={{ fontSize: '0.76rem', fontWeight: 700 }}>
              LOCAL RUNTIME DAEMON STATUS
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <span
                className={`clay-tag ${daemonStatus?.ollamaOnline ? 'clay-tag-sage' : ''
                  }`}
              >
                OLLAMA: {daemonStatus?.ollamaOnline ? 'ONLINE' : 'STANDBY'}
              </span>
              <span
                className={`clay-tag ${daemonStatus?.lmStudioOnline ? 'clay-tag-sage' : ''
                  }`}
              >
                LM STUDIO: {daemonStatus?.lmStudioOnline ? 'ONLINE' : 'STANDBY'}
              </span>
            </div>
          </div>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 2 }}
            type="button"
            className="clay-btn clay-btn-terracotta"
            style={{ width: '100%', padding: '14px 20px' }}
            onClick={handleSaveModelsAndKeys}
          >
            <Save size={16} />
            <span>SAVE MODEL ROUTING TO MY ACCOUNT</span>
          </motion.button>
        </div>
      )}

      {/* =====================================================================
          TAB 3: API KEYS VAULT
      ===================================================================== */}
      {activeTab === 'apikeys' && (
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18,
            }}
          >
            <span className="clay-tag clay-tag-cobalt">
              <Key size={14} />
              <span>PRIVATE PER-USER API KEYS &amp; LOCAL ENDPOINTS VAULT</span>
            </span>
            <span className="clay-tag">
              SCOPED TO: @{user.username}
            </span>
          </div>

          <p
            style={{
              fontSize: '0.84rem',
              color: 'var(--ink-secondary)',
              marginBottom: 18,
            }}
          >
            Provide API keys for any provider on demand. Keys are stored
            exclusively under your account&apos;s isolated SQLite configuration
            row and masked when returned to the UI.
          </p>

          <div className="grid-2" style={{ gap: 16, marginBottom: 20 }}>
            {[
              { key: 'openai', label: 'OPENAI API KEY', placeholder: 'sk-proj-...' },
              { key: 'gemini', label: 'GOOGLE GEMINI API KEY (LLM + NEURAL EMBEDDINGS)', placeholder: 'AIzaSy...' },
              { key: 'anthropic', label: 'ANTHROPIC CLAUDE API KEY', placeholder: 'sk-ant-...' },
              { key: 'groq', label: 'GROQ CLOUD API KEY', placeholder: 'gsk_...' },
              { key: 'openrouter', label: 'OPENROUTER API KEY', placeholder: 'sk-or-v1-...' },
              { key: 'cohere', label: 'COHERE RERANK v3.5 API KEY (OPTIONAL)', placeholder: 'cohere-...' },
              { key: 'jina', label: 'JINA RERANKER v2 API KEY (OPTIONAL)', placeholder: 'jina_...' },
            ].map((item) => (
              <div key={item.key}>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 5,
                  }}
                >
                  {item.label}
                </label>
                <input
                  type="password"
                  className="clay-input font-mono"
                  placeholder={item.placeholder}
                  value={(apiKeys as Record<string, string>)[item.key] || ''}
                  onChange={(e) =>
                    setApiKeys({ ...apiKeys, [item.key]: e.target.value })
                  }
                />
              </div>
            ))}

            <div>
              <label
                className="font-mono"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 5,
                }}
              >
                OLLAMA LOCAL SERVER URL
              </label>
              <input
                type="text"
                className="clay-input font-mono"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
              />
            </div>

            <div>
              <label
                className="font-mono"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 5,
                }}
              >
                LM STUDIO / LLAMA.CPP BASE URL
              </label>
              <input
                type="text"
                className="clay-input font-mono"
                value={lmStudioUrl}
                onChange={(e) => setLmStudioUrl(e.target.value)}
              />
            </div>
          </div>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 2 }}
            type="button"
            className="clay-btn clay-btn-terracotta"
            style={{ width: '100%', padding: '14px 20px' }}
            onClick={handleSaveModelsAndKeys}
          >
            <Save size={16} />
            <span>SAVE API KEYS &amp; ENDPOINTS TO MY PRIVATE VAULT</span>
          </motion.button>
        </div>
      )}

      {/* =====================================================================
          TAB 4: OFFLINE GGUF MODEL SCANNER & DOWNLOAD PORTAL
      ===================================================================== */}
      {activeTab === 'offline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="clay-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <span className="clay-tag clay-tag-sage">
                <FolderSearch size={14} />
                <span>OFFLINE MODEL PATH VERIFIER &amp; GGUF HEADER SCANNER</span>
              </span>
              <span className="clay-tag">
                BOUND FILE: {config.offlineModelPath.split(/[\\/]/).pop()}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <input
                type="text"
                className="clay-input font-mono"
                placeholder="e.g. C:\Users\bonami\Desktop\RAG\models"
                value={scanInputPath}
                onChange={(e) => setScanInputPath(e.target.value)}
              />
              <button
                type="button"
                disabled={isScanning}
                className="clay-btn clay-btn-sage"
                onClick={() => runPathScan(scanInputPath)}
              >
                <HardDrive size={15} />
                <span>{isScanning ? 'SCANNING...' : 'VERIFY & SCAN PATH'}</span>
              </button>
            </div>

            {scanResult?.commonDirectoriesChecked && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {scanResult.commonDirectoriesChecked.map((dir) => (
                  <button
                    key={dir.label}
                    type="button"
                    className="clay-btn"
                    style={{ padding: '6px 12px', fontSize: '0.73rem' }}
                    onClick={() => {
                      setScanInputPath(dir.path);
                      runPathScan(dir.path);
                    }}
                  >
                    <span>{dir.label}</span>
                    <span className="clay-tag" style={{ fontSize: '0.62rem' }}>
                      {dir.exists ? 'FOUND' : 'EMPTY'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {scanResult && (
              <div className="clay-well">
                <div
                  className="font-mono"
                  style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 12 }}
                >
                  {scanResult.message}
                </div>
                {scanResult.modelsFound.length > 0 && (
                  <div className="grid-2">
                    {scanResult.modelsFound.map((mod) => {
                      const isBound = config.offlineModelPath === mod.fullPath;
                      return (
                        <div key={mod.fullPath} className="clay-card-alt">
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <span className="clay-tag clay-tag-terracotta">
                              {mod.format} // {mod.quantization}
                            </span>
                            <span className="clay-tag clay-tag-sage">
                              {mod.headerValid ? 'GGUF HEADER VALID' : 'UNVERIFIED'}
                            </span>
                          </div>
                          <div
                            className="font-display"
                            style={{ fontWeight: 700, marginBottom: 4 }}
                          >
                            {mod.name}
                          </div>
                          <div
                            className="font-mono"
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--ink-secondary)',
                              marginBottom: 10,
                              wordBreak: 'break-all',
                            }}
                          >
                            {mod.fullPath} ({mod.sizeFormatted})
                          </div>
                          <button
                            type="button"
                            className={`clay-btn ${isBound ? 'clay-btn-sage' : 'clay-btn-charcoal'
                              }`}
                            style={{ width: '100%', padding: '8px 12px', fontSize: '0.76rem' }}
                            onClick={async () => {
                              setScanInputPath(mod.fullPath);
                              setReshaperProvider('offline_gguf');
                              setReshaperModel(mod.name);
                              await onUpdateConfig({
                                offlineModelPath: mod.fullPath,
                                reshaperProvider: 'offline_gguf',
                                reshaperModel: mod.name,
                              });
                              showToast(`BOUND OFFLINE MODEL: ${mod.name}`);
                            }}
                          >
                            {isBound ? 'ACTIVE BOUND MODEL' : 'BIND THIS OFFLINE MODEL'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="clay-card">
            <span className="clay-tag clay-tag-ochre" style={{ marginBottom: 16 }}>
              <Server size={14} />
              <span>CURATED OFFLINE GGUF MODEL DOWNLOAD PORTAL</span>
            </span>

            <div className="grid-3">
              {modelCatalog.map((item) => (
                <div
                  key={item.id}
                  className="clay-card-alt"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <span className="clay-tag clay-tag-cobalt">
                        {item.parameterSize} // {item.recommendedQuant}
                      </span>
                      <span className="clay-tag">{item.fileSizeGb}</span>
                    </div>
                    <h4
                      className="font-display"
                      style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: 4 }}
                    >
                      {item.name}
                    </h4>
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                      {item.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      className="clay-well font-mono"
                      style={{
                        padding: '7px 10px',
                        fontSize: '0.7rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        $ {item.ollamaCommand}
                      </span>
                      <button
                        type="button"
                        className="clay-btn"
                        style={{ padding: '4px 7px' }}
                        onClick={() => copyCommand(`${item.id}-ol`, item.ollamaCommand)}
                      >
                        {copiedId === `${item.id}-ol` ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <a
                        href={item.directGgufPortalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clay-btn clay-btn-terracotta"
                        style={{ textDecoration: 'none', padding: '8px 10px', fontSize: '0.72rem' }}
                      >
                        <ExternalLink size={12} />
                        <span>GGUF PORTAL</span>
                      </a>
                      <a
                        href={item.huggingFaceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clay-btn"
                        style={{ textDecoration: 'none', padding: '8px 10px', fontSize: '0.72rem' }}
                      >
                        <ExternalLink size={12} />
                        <span>MODEL CARD</span>
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: APPEARANCE, COLOR PALETTES & PIPELINE DEFAULTS
      ===================================================================== */}
      {activeTab === 'preferences' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Curated 9-Palette Color Studio (Applies to BOTH Clay & Liquid Glass) */}
          <div className="clay-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div>
                <span className="clay-tag clay-tag-terracotta">
                  <span>COLOR PALETTE STUDIO (CLAY &amp; LIQUID GLASS)</span>
                </span>
                <h3
                  className="font-display"
                  style={{ fontSize: '1.22rem', marginTop: 8 }}
                >
                  Choose Your Active Color Palette
                </h3>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => onChangeTheme('clay')}
                  className={`clay-btn ${themeMode === 'clay' ? 'clay-btn-terracotta' : ''
                    }`}
                  style={{ padding: '9px 16px', fontSize: '0.78rem' }}
                >
                  <Sun size={15} />
                  <span>TACTILE CLAY</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTheme('liquid-glass')}
                  className={`clay-btn ${themeMode === 'liquid-glass' ? 'clay-btn-cobalt' : ''
                    }`}
                  style={{ padding: '9px 16px', fontSize: '0.78rem' }}
                >
                  <Orbit size={15} />
                  <span>LIQUID GLASS</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTheme('vision-ceramic')}
                  className={`clay-btn ${themeMode === 'vision-ceramic' ? 'clay-btn-sage' : ''
                    }`}
                  style={{ padding: '9px 16px', fontSize: '0.78rem' }}
                >
                  <Aperture size={15} />
                  <span>VISION CERAMIC</span>
                </button>
              </div>
            </div>

            <div className="grid-3">
              {COLOR_PALETTES.map((pal) => {
                const isSelected = pal.id === paletteId;
                return (
                  <motion.div
                    key={pal.id}
                    whileHover={{ y: -3 }}
                    whileTap={{ y: 1 }}
                    onClick={() => {
                      onChangePalette(pal.id);
                      showToast(`APPLIED PALETTE: ${pal.name.toUpperCase()}`);
                    }}
                    className="clay-card-alt"
                    style={{
                      cursor: 'pointer',
                      borderColor: isSelected
                        ? 'var(--clay-terracotta)'
                        : 'var(--clay-border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        className="font-display"
                        style={{ fontSize: '0.98rem', fontWeight: 700 }}
                      >
                        {pal.name}
                      </span>
                      {isSelected && (
                        <span className="clay-tag clay-tag-sage">ACTIVE</span>
                      )}
                    </div>

                    {/* Stacked Capsule Swatches (Inspired by User's Palette Cards) */}
                    <div
                      className="clay-well"
                      style={{
                        padding: 8,
                        borderRadius: 16,
                        display: 'flex',
                        gap: 6,
                      }}
                    >
                      {pal.swatches.map((hex) => (
                        <div
                          key={hex}
                          title={hex}
                          style={{
                            flex: 1,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: hex,
                            border: '1.5px solid rgba(255,255,255,0.45)',
                            boxShadow:
                              'inset 1.5px 1.5px 3px rgba(255,255,255,0.35), inset -1.5px -1.5px 3px rgba(0,0,0,0.28)',
                          }}
                        />
                      ))}
                    </div>

                    <div
                      className="font-mono"
                      style={{
                        fontSize: '0.67rem',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      {pal.subtitle}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="grid-2">
            <div className="clay-card">
              <span
                className="clay-tag clay-tag-sage"
                style={{ marginBottom: 16 }}
              >
                <span>SPATIAL LIQUID FLOW CONTROLS</span>
              </span>

              <div className="clay-card-alt">
                <div
                  className="font-display"
                  style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: 10 }}
                >
                  Liquid Glass 3D Silk Ribbon Motion Speed
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => onChangeSpatialFlow('dynamic')}
                    className={`clay-btn ${spatialFlow === 'dynamic' ? 'clay-btn-sage' : ''
                      }`}
                  >
                    DYNAMIC ORBITAL FLOW
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeSpatialFlow('calm')}
                    className={`clay-btn ${spatialFlow === 'calm' ? 'clay-btn-sage' : ''
                      }`}
                  >
                    CALM AMBIENT DRIFT
                  </button>
                </div>
              </div>
            </div>

            <div className="clay-card">
              <span className="clay-tag clay-tag-cobalt" style={{ marginBottom: 16 }}>
                <span>DEFAULT RAG PIPELINE PARAMETERS</span>
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label
                    className="font-mono"
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    DEFAULT FALLBACK CHUNKING STRATEGY
                  </label>
                  <select
                    className="clay-select"
                    value={config.defaultChunkStrategy}
                    onChange={(e) =>
                      onUpdateConfig({
                        defaultChunkStrategy: e.target.value as ChunkStrategyType,
                      })
                    }
                  >
                    <option value="semantic">Semantic Inflection Boundary</option>
                    <option value="hierarchical">Hierarchical Parent-Child</option>
                    <option value="proposition">Atomic Fact Propositions</option>
                    <option value="structural">Structural AST &amp; Table Aware</option>
                    <option value="sliding_window">Header-Injected Sliding Window</option>
                  </select>
                </div>

                <div>
                  <div
                    className="font-mono"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    <span>CRAG NOISE GATE THRESHOLD</span>
                    <span>{(config.cragThreshold * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    className="clay-slider"
                    min={0.15}
                    max={0.75}
                    step={0.05}
                    value={config.cragThreshold}
                    onChange={(e) =>
                      onUpdateConfig({ cragThreshold: Number(e.target.value) })
                    }
                  />
                </div>

                <div>
                  <div
                    className="font-mono"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      marginBottom: 6,
                    }}
                  >
                    <span>TOP-K RERANKED CONTEXT CHUNKS</span>
                    <span>{config.topKReranked} CHUNKS</span>
                  </div>
                  <input
                    type="range"
                    className="clay-slider"
                    min={2}
                    max={10}
                    step={1}
                    value={config.topKReranked}
                    onChange={(e) =>
                      onUpdateConfig({ topKReranked: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
