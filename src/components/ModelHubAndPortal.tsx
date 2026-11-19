import React, { useEffect, useState } from 'react';
import { authFetch } from '../api';
import { motion } from 'framer-motion';
import {
  Cpu,
  Key,
  FolderSearch,
  ExternalLink,
  Copy,
  Check,
  HardDrive,
  Server,
  Save,
  RefreshCw,
} from 'lucide-react';
import {
  ModelPortalCatalogItem,
  OfflineModelFileInfo,
  RagPipelineConfig,
} from '../types';

interface ModelHubAndPortalProps {
  config: RagPipelineConfig;
  modelCatalog: ModelPortalCatalogItem[];
  onUpdateConfig: (partial: Partial<RagPipelineConfig>) => Promise<void>;
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
  ollama: [
    'llama3.1:8b',
    'qwen2.5:3b',
    'phi3.5:3.8b',
    'gemma2:2b',
    'mistral:7b',
  ],
  lmstudio: [
    'qwen2.5-3b-instruct',
    'meta-llama-3.1-8b-instruct',
    'phi-3.5-mini-instruct',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest'],
  groq: [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768',
  ],
  openrouter: [
    'meta-llama/llama-3.1-8b-instruct',
    'qwen/qwen-2.5-7b-instruct',
    'google/gemini-2.5-flash',
  ],
};

export const ModelHubAndPortal: React.FC<ModelHubAndPortalProps> = ({
  config,
  modelCatalog,
  onUpdateConfig,
}) => {
  const [reshaperProvider, setReshaperProvider] = useState(
    config.reshaperProvider
  );
  const [reshaperModel, setReshaperModel] = useState(config.reshaperModel);
  const [generatorProvider, setGeneratorProvider] = useState(
    config.generatorProvider
  );
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

  // Offline model path browser state
  const [scanInputPath, setScanInputPath] = useState(
    config.offlineModelPath || ''
  );
  const [scanResult, setScanResult] = useState<{
    resolvedPath: string;
    exists: boolean;
    isDirectory: boolean;
    modelsFound: OfflineModelFileInfo[];
    commonDirectoriesChecked: Array<{
      label: string;
      path: string;
      exists: boolean;
    }>;
    message: string;
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Local daemon status
  const [daemonStatus, setDaemonStatus] = useState<{
    ollamaOnline: boolean;
    ollamaModels: string[];
    lmStudioOnline: boolean;
    lmStudioModels: string[];
  } | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  const runPathScan = async (pathToScan: string) => {
    setIsScanning(true);
    try {
      const resp = await authFetch('/api/models/scan-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToScan }),
      });
      const data = await resp.json();
      setScanResult(data);
    } catch {
      // ignore
    } finally {
      setIsScanning(false);
    }
  };

  const probeLocalDaemons = async () => {
    try {
      const resp = await authFetch('/api/models/probe-local-daemons');
      const data = await resp.json();
      setDaemonStatus(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    runPathScan(config.offlineModelPath || '');
    probeLocalDaemons();
  }, []);

  const handleSaveAll = async () => {
    await onUpdateConfig({
      reshaperProvider,
      reshaperModel,
      generatorProvider,
      generatorModel,
      apiKeys,
      localEndpoints: {
        ollamaUrl,
        lmStudioUrl,
      },
      offlineModelPath: scanInputPath,
    });
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2600);
  };

  const copyCommand = (id: string, cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Section 1: Switchable Small LLM Prompt Reshaper & Generator Routing + API Key Vault */}
      <div className="grid-2">
        {/* Left: Switchable Small LLM Reshaper & Synthesis Model Selector */}
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <span className="clay-tag clay-tag-terracotta">
              <Cpu size={13} />
              <span>SWITCHABLE SMALL LLM & GENERATOR ROUTER</span>
            </span>
            {savedBanner && (
              <span className="clay-tag clay-tag-sage">
                CONFIGURATION APPLIED
              </span>
            )}
          </div>

          {/* 1. Small LLM Prompt Reshaper Box */}
          <div className="clay-card-alt" style={{ marginBottom: 14 }}>
            <div
              className="font-display"
              style={{
                fontSize: '0.92rem',
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              STAGE 01 // SMALL LLM PROMPT RESHAPER & HYDE AGENT
            </div>
            <div
              style={{
                fontSize: '0.76rem',
                color: 'var(--ink-secondary)',
                marginBottom: 10,
              }}
            >
              Reshapes raw user queries, generates Step-Back abstractions, 3-way
              Sub-Queries, and HyDE dense anchors
            </div>

            <div className="grid-2" style={{ gap: 10 }}>
              <div>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
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
                    const defaultMod = PROVIDER_MODELS[prov]?.[0] || '';
                    if (defaultMod) setReshaperModel(defaultMod);
                  }}
                >
                  <option value="builtin_local">
                    Built-in Local Micro-Agent (No Key)
                  </option>
                  <option value="offline_gguf">
                    Offline Local GGUF / ONNX Model File
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
                    marginBottom: 4,
                  }}
                >
                  SMALL LLM MODEL ID
                </label>
                <input
                  type="text"
                  className="clay-input font-mono"
                  style={{ padding: '9px 12px', fontSize: '0.82rem' }}
                  value={reshaperModel}
                  onChange={(e) => setReshaperModel(e.target.value)}
                  list="reshaper-model-suggestions"
                />
                <datalist id="reshaper-model-suggestions">
                  {(PROVIDER_MODELS[reshaperProvider] || []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* 2. Grounded Answer Generator Box */}
          <div className="clay-card-alt" style={{ marginBottom: 14 }}>
            <div
              className="font-display"
              style={{
                fontSize: '0.92rem',
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              STAGE 06 // GROUNDED ANSWER SYNTHESIS & SELF-RAG LLM
            </div>
            <div
              style={{
                fontSize: '0.76rem',
                color: 'var(--ink-secondary)',
                marginBottom: 10,
              }}
            >
              Synthesizes cited answers from CRAG-verified chunks and audits
              claim-to-source groundedness
            </div>

            <div className="grid-2" style={{ gap: 10 }}>
              <div>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  GENERATOR PROVIDER
                </label>
                <select
                  className="clay-select"
                  value={generatorProvider}
                  onChange={(e) => {
                    const prov = e.target
                      .value as RagPipelineConfig['generatorProvider'];
                    setGeneratorProvider(prov);
                    const defaultMod = PROVIDER_MODELS[prov]?.[0] || '';
                    if (defaultMod) setGeneratorModel(defaultMod);
                  }}
                >
                  <option value="builtin_local">
                    Built-in Grounded Synthesizer (No Key)
                  </option>
                  <option value="offline_gguf">
                    Offline Local GGUF / ONNX Model File
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
                    marginBottom: 4,
                  }}
                >
                  SYNTHESIS MODEL ID
                </label>
                <input
                  type="text"
                  className="clay-input font-mono"
                  style={{ padding: '9px 12px', fontSize: '0.82rem' }}
                  value={generatorModel}
                  onChange={(e) => setGeneratorModel(e.target.value)}
                  list="generator-model-suggestions"
                />
                <datalist id="generator-model-suggestions">
                  {(PROVIDER_MODELS[generatorProvider] || []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 2 }}
            type="button"
            className="clay-btn clay-btn-terracotta"
            style={{ width: '100%', padding: '12px 18px' }}
            onClick={handleSaveAll}
          >
            <Save size={15} />
            <span>SAVE & APPLY MODEL ROUTING CONFIGURATION</span>
          </motion.button>
        </div>

        {/* Right: On-Demand Multi-Provider API Key Vault & Local Daemon Endpoints */}
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <span className="clay-tag clay-tag-cobalt">
              <Key size={13} />
              <span>ON-DEMAND MULTI-PROVIDER API KEY VAULT</span>
            </span>
            <button
              type="button"
              className="clay-btn"
              style={{ padding: '4px 10px', fontSize: '0.72rem' }}
              onClick={probeLocalDaemons}
            >
              <RefreshCw size={12} />
              <span>PROBE LOCAL DAEMONS</span>
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 10,
              marginBottom: 14,
            }}
          >
            {[
              {
                key: 'openai',
                label: 'OPENAI API KEY',
                placeholder: 'sk-proj-...',
              },
              {
                key: 'gemini',
                label: 'GOOGLE GEMINI API KEY',
                placeholder: 'AIzaSy...',
              },
              {
                key: 'anthropic',
                label: 'ANTHROPIC CLAUDE API KEY',
                placeholder: 'sk-ant-...',
              },
              {
                key: 'groq',
                label: 'GROQ CLOUD API KEY',
                placeholder: 'gsk_...',
              },
              {
                key: 'openrouter',
                label: 'OPENROUTER API KEY',
                placeholder: 'sk-or-v1-...',
              },
            ].map((item) => (
              <div key={item.key}>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  {item.label}
                </label>
                <input
                  type="password"
                  className="clay-input font-mono"
                  style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                  placeholder={item.placeholder}
                  value={(apiKeys as any)[item.key]}
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
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                OLLAMA LOCAL ENDPOINT
              </label>
              <input
                type="text"
                className="clay-input font-mono"
                style={{ padding: '8px 12px', fontSize: '0.78rem' }}
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
              />
            </div>
          </div>

          {/* Local Daemon Detection Status Card */}
          <div className="clay-card-alt">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span
                className="font-mono"
                style={{ fontSize: '0.73rem', fontWeight: 700 }}
              >
                LOCAL RUNTIME DAEMON TELEMETRY
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <span
                  className={`clay-tag ${
                    daemonStatus?.ollamaOnline ? 'clay-tag-sage' : ''
                  }`}
                >
                  OLLAMA:{' '}
                  {daemonStatus?.ollamaOnline ? 'ONLINE' : 'NOT DETECTED'}
                </span>
                <span
                  className={`clay-tag ${
                    daemonStatus?.lmStudioOnline ? 'clay-tag-sage' : ''
                  }`}
                >
                  LM STUDIO:{' '}
                  {daemonStatus?.lmStudioOnline ? 'ONLINE' : 'NOT DETECTED'}
                </span>
              </div>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
              The system executes out-of-the-box using the built-in Python
              Agentic Core. Supplying any cloud API key above or starting a
              local Ollama / LM Studio server dynamically switches inference
              without restarting.
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Offline Model File Path Browser & Header Validator */}
      <div className="clay-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="clay-tag clay-tag-sage">
              <FolderSearch size={13} />
              <span>
                OFFLINE LOCAL MODEL PATH VERIFIER & GGUF HEADER SCANNER
              </span>
            </span>
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--ink-secondary)',
                fontWeight: 600,
              }}
            >
              Enter or pick the directory/file path where you downloaded offline
              .gguf, .onnx, or .safetensors models
            </span>
          </div>
        </div>

        {/* Path Input Bar */}
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
            placeholder="e.g. C:\Users\bonami\Desktop\RAG\models or C:\Users\bonami\Downloads\Qwen2.5-3B-Instruct-Q4_K_M.gguf"
            value={scanInputPath}
            onChange={(e) => setScanInputPath(e.target.value)}
          />
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 2 }}
            type="button"
            disabled={isScanning}
            className="clay-btn clay-btn-sage"
            onClick={() => runPathScan(scanInputPath)}
          >
            <HardDrive size={15} />
            <span>
              {isScanning ? 'SCANNING DISK...' : 'VERIFY & SCAN MODEL PATH'}
            </span>
          </motion.button>
        </div>

        {/* Quick Common Local Directories Pills */}
        {scanResult?.commonDirectoriesChecked && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 14,
              alignItems: 'center',
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: '0.71rem',
                fontWeight: 700,
                color: 'var(--ink-muted)',
              }}
            >
              QUICK SCAN DIRECTORIES:
            </span>
            {scanResult.commonDirectoriesChecked.map((dir) => (
              <button
                key={dir.label}
                type="button"
                className="clay-btn"
                style={{ padding: '5px 11px', fontSize: '0.72rem' }}
                onClick={() => {
                  setScanInputPath(dir.path);
                  runPathScan(dir.path);
                }}
              >
                <span>{dir.label}</span>
                <span className="clay-tag" style={{ fontSize: '0.62rem' }}>
                  {dir.exists ? 'EXISTS' : 'EMPTY'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Scan Result Table / Cards */}
        {scanResult && (
          <div className="clay-well">
            <div
              className="font-mono"
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                marginBottom: 10,
                color: scanResult.exists
                  ? 'var(--ink-primary)'
                  : 'var(--clay-terracotta)',
              }}
            >
              {scanResult.message}
            </div>

            {scanResult.modelsFound.length > 0 && (
              <div className="grid-2" style={{ gap: 12 }}>
                {scanResult.modelsFound.map((mod) => {
                  const isBound = config.offlineModelPath === mod.fullPath;
                  return (
                    <div
                      key={mod.fullPath}
                      className="clay-card-alt"
                      style={{
                        borderColor: isBound
                          ? 'var(--clay-sage)'
                          : 'var(--clay-border-light)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <span className="clay-tag clay-tag-terracotta">
                          {mod.format} // {mod.quantization}
                        </span>
                        <span
                          className={`clay-tag ${
                            mod.headerValid ? 'clay-tag-sage' : ''
                          }`}
                        >
                          {mod.headerValid
                            ? 'HEADER MAGIC BYTES VALID'
                            : 'UNVERIFIED HEADER'}
                        </span>
                      </div>

                      <div
                        className="font-display"
                        style={{
                          fontSize: '0.94rem',
                          fontWeight: 700,
                          marginBottom: 3,
                        }}
                      >
                        {mod.name}
                      </div>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: '0.71rem',
                          color: 'var(--ink-secondary)',
                          wordBreak: 'break-all',
                          marginBottom: 8,
                        }}
                      >
                        Path: {mod.fullPath} ({mod.sizeFormatted} |{' '}
                        {mod.architectureHint})
                      </div>

                      <button
                        type="button"
                        className={`clay-btn ${
                          isBound ? 'clay-btn-sage' : 'clay-btn-charcoal'
                        }`}
                        style={{
                          width: '100%',
                          padding: '7px 12px',
                          fontSize: '0.75rem',
                        }}
                        onClick={async () => {
                          setScanInputPath(mod.fullPath);
                          setReshaperProvider('offline_gguf');
                          setReshaperModel(mod.name);
                          await onUpdateConfig({
                            offlineModelPath: mod.fullPath,
                            reshaperProvider: 'offline_gguf',
                            reshaperModel: mod.name,
                          });
                        }}
                      >
                        {isBound
                          ? 'ACTIVE BOUND OFFLINE MODEL'
                          : 'SELECT & BIND THIS OFFLINE MODEL FILE'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3: Offline Model Download Portal & Direct HuggingFace / Ollama Instructions */}
      <div className="clay-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div>
            <span className="clay-tag clay-tag-ochre">
              <Server size={13} />
              <span>
                OFFLINE MODEL DOWNLOAD PORTAL & GUIDED INSTALLATION DIRECTORY
              </span>
            </span>
            <h3
              className="font-display"
              style={{ fontSize: '1.15rem', marginTop: 6 }}
            >
              Verified Small & Medium Models for Offline RAG Execution
            </h3>
          </div>
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--ink-secondary)',
              maxWidth: 520,
            }}
          >
            Click any model portal link to download quantized .gguf files
            directly from HuggingFace, or copy the CLI command to pull into
            your `./models` directory.
          </span>
        </div>

        <div className="grid-3">
          {modelCatalog.map((item) => (
            <div
              key={item.id}
              className="clay-card-alt"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <span className="clay-tag clay-tag-cobalt">
                    {item.parameterSize} // {item.recommendedQuant}
                  </span>
                  <span className="clay-tag">
                    {item.fileSizeGb} (MIN {item.minRamGb}GB RAM)
                  </span>
                </div>

                <div
                  className="font-display"
                  style={{
                    fontSize: '0.96rem',
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  {item.name}
                </div>
                <div
                  style={{
                    fontSize: '0.77rem',
                    color: 'var(--ink-secondary)',
                    marginBottom: 10,
                  }}
                >
                  {item.description}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Copyable Ollama CLI command */}
                <div
                  className="clay-well font-mono"
                  style={{
                    padding: '7px 10px',
                    fontSize: '0.71rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
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
                    style={{ padding: '3px 7px', fontSize: '0.67rem' }}
                    onClick={() =>
                      copyCommand(`${item.id}-ollama`, item.ollamaCommand)
                    }
                  >
                    {copiedId === `${item.id}-ollama` ? (
                      <Check size={11} />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                </div>

                {/* Copyable HuggingFace CLI command */}
                <div
                  className="clay-well font-mono"
                  style={{
                    padding: '7px 10px',
                    fontSize: '0.69rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
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
                    $ {item.hfCliCommand}
                  </span>
                  <button
                    type="button"
                    className="clay-btn"
                    style={{ padding: '3px 7px', fontSize: '0.67rem' }}
                    onClick={() =>
                      copyCommand(`${item.id}-hf`, item.hfCliCommand)
                    }
                  >
                    {copiedId === `${item.id}-hf` ? (
                      <Check size={11} />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                </div>

                {/* Direct Portal Redirect Links */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                  }}
                >
                  <a
                    href={item.directGgufPortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="clay-btn clay-btn-terracotta"
                    style={{
                      textDecoration: 'none',
                      padding: '8px 10px',
                      fontSize: '0.72rem',
                    }}
                  >
                    <ExternalLink size={12} />
                    <span>GGUF FILES PORTAL</span>
                  </a>
                  <a
                    href={item.huggingFaceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="clay-btn"
                    style={{
                      textDecoration: 'none',
                      padding: '8px 10px',
                      fontSize: '0.72rem',
                    }}
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
  );
};
