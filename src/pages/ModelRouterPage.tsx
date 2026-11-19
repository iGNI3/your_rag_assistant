import React, { useEffect, useState } from 'react';
import { authFetch } from '../api';
import { motion } from 'framer-motion';
import {
  Cpu,
  Key,
  Save,
  RefreshCw,
  ArrowRight,
  HardDrive,
} from 'lucide-react';
import { RagPipelineConfig } from '../types';

interface ModelRouterPageProps {
  config: RagPipelineConfig;
  onUpdateConfig: (partial: Partial<RagPipelineConfig>) => Promise<void>;
  onGoToOfflinePortal: () => void;
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

export const ModelRouterPage: React.FC<ModelRouterPageProps> = ({
  config,
  onUpdateConfig,
  onGoToOfflinePortal,
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

  const [daemonStatus, setDaemonStatus] = useState<{
    ollamaOnline: boolean;
    ollamaModels: string[];
    lmStudioOnline: boolean;
    lmStudioModels: string[];
  } | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

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
    });
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2600);
  };

  return (
    <div className="grid-2">
      {/* Left: Switchable Small LLM Prompt Reshaper & Generator Routing */}
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
            <Cpu size={14} />
            <span>SWITCHABLE SMALL LLM &amp; GENERATOR ROUTER</span>
          </span>
          {savedBanner && (
            <span className="clay-tag clay-tag-sage">
              SAVED TO SQLITE CONFIG
            </span>
          )}
        </div>

        {/* 1. Small LLM Prompt Reshaper Box */}
        <div className="clay-card-alt" style={{ marginBottom: 18 }}>
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
            Reshapes raw user queries, strips conversational noise, generates
            Step-Back abstractions, 3-way Sub-Queries, and HyDE dense anchors.
          </p>

          <div className="grid-2" style={{ gap: 14 }}>
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
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                SMALL LLM MODEL ID
              </label>
              <input
                type="text"
                className="clay-input font-mono"
                style={{ padding: '11px 14px', fontSize: '0.84rem' }}
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
        <div className="clay-card-alt" style={{ marginBottom: 18 }}>
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
            Synthesizes cited answers from CRAG-verified chunks and audits
            claim-to-source groundedness.
          </p>

          <div className="grid-2" style={{ gap: 14 }}>
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
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                SYNTHESIS MODEL ID
              </label>
              <input
                type="text"
                className="clay-input font-mono"
                style={{ padding: '11px 14px', fontSize: '0.84rem' }}
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

        <div style={{ display: 'flex', gap: 12 }}>
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 2 }}
            type="button"
            className="clay-btn clay-btn-terracotta"
            style={{ flex: 1, padding: '14px 18px' }}
            onClick={handleSaveAll}
          >
            <Save size={16} />
            <span>SAVE &amp; APPLY MODEL ROUTING</span>
          </motion.button>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 2 }}
            type="button"
            className="clay-btn"
            style={{ padding: '14px 18px' }}
            onClick={onGoToOfflinePortal}
          >
            <HardDrive size={16} />
            <span>OFFLINE GGUF PORTAL</span>
            <ArrowRight size={15} />
          </motion.button>
        </div>
      </div>

      {/* Right: On-Demand Multi-Provider API Key Vault & Local Daemon Endpoints */}
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
            <span>ON-DEMAND MULTI-PROVIDER API KEY VAULT</span>
          </span>
          <button
            type="button"
            className="clay-btn"
            style={{ padding: '6px 12px', fontSize: '0.74rem' }}
            onClick={probeLocalDaemons}
          >
            <RefreshCw size={13} />
            <span>PROBE LOCAL DAEMONS</span>
          </button>
        </div>

        <div className="grid-2" style={{ gap: 14, marginBottom: 18 }}>
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
                style={{ padding: '11px 14px', fontSize: '0.82rem' }}
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
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'block',
                marginBottom: 5,
              }}
            >
              OLLAMA LOCAL ENDPOINT
            </label>
            <input
              type="text"
              className="clay-input font-mono"
              style={{ padding: '11px 14px', fontSize: '0.82rem' }}
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
              LM STUDIO / LLAMA.CPP ENDPOINT
            </label>
            <input
              type="text"
              className="clay-input font-mono"
              style={{ padding: '11px 14px', fontSize: '0.82rem' }}
              value={lmStudioUrl}
              onChange={(e) => setLmStudioUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="clay-card-alt">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span
              className="font-mono"
              style={{ fontSize: '0.76rem', fontWeight: 700 }}
            >
              LOCAL RUNTIME DAEMON STATUS
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <span
                className={`clay-tag ${
                  daemonStatus?.ollamaOnline ? 'clay-tag-sage' : ''
                }`}
              >
                OLLAMA: {daemonStatus?.ollamaOnline ? 'ONLINE' : 'STANDBY'}
              </span>
              <span
                className={`clay-tag ${
                  daemonStatus?.lmStudioOnline ? 'clay-tag-sage' : ''
                }`}
              >
                LM STUDIO: {daemonStatus?.lmStudioOnline ? 'ONLINE' : 'STANDBY'}
              </span>
            </div>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
            All pipeline stages run out-of-the-box using the built-in Python
            Agentic Core. Supplying any API key above or running Ollama / LM
            Studio dynamically upgrades prompt reshaping and synthesis on
            demand.
          </p>
        </div>
      </div>
    </div>
  );
};
