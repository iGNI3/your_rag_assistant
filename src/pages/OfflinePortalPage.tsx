import React, { useEffect, useState } from 'react';
import { authFetch } from '../api';
import { motion } from 'framer-motion';
import {
  FolderSearch,
  ExternalLink,
  Copy,
  Check,
  HardDrive,
  Server,
} from 'lucide-react';
import {
  ModelPortalCatalogItem,
  OfflineModelFileInfo,
  RagPipelineConfig,
} from '../types';

interface OfflinePortalPageProps {
  config: RagPipelineConfig;
  modelCatalog: ModelPortalCatalogItem[];
  onUpdateConfig: (partial: Partial<RagPipelineConfig>) => Promise<void>;
}

export const OfflinePortalPage: React.FC<OfflinePortalPageProps> = ({
  config,
  modelCatalog,
  onUpdateConfig,
}) => {
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  useEffect(() => {
    runPathScan(config.offlineModelPath || '');
  }, []);

  const copyCommand = (id: string, cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* Top Section: Local Disk GGUF / ONNX File Path Browser & Header Validator */}
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
            <span>
              OFFLINE LOCAL MODEL PATH VERIFIER &amp; GGUF HEADER SCANNER
            </span>
          </span>
          <span className="clay-tag">
            ACTIVE BINDING: {config.offlineModelPath.split(/[\\/]/).pop()}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 14,
            marginBottom: 16,
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
            <HardDrive size={16} />
            <span>
              {isScanning ? 'SCANNING DISK...' : 'VERIFY & SCAN MODEL PATH'}
            </span>
          </motion.button>
        </div>

        {scanResult?.commonDirectoriesChecked && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 16,
              alignItems: 'center',
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: '0.73rem',
                fontWeight: 700,
                color: 'var(--ink-muted)',
              }}
            >
              DETECTED SYSTEM MODEL FOLDERS:
            </span>
            {scanResult.commonDirectoriesChecked.map((dir) => (
              <button
                key={dir.label}
                type="button"
                className="clay-btn"
                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                onClick={() => {
                  setScanInputPath(dir.path);
                  runPathScan(dir.path);
                }}
              >
                <span>{dir.label}</span>
                <span className="clay-tag" style={{ fontSize: '0.64rem' }}>
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
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                marginBottom: 12,
                color: scanResult.exists
                  ? 'var(--ink-primary)'
                  : 'var(--clay-terracotta)',
              }}
            >
              {scanResult.message}
            </div>

            {scanResult.modelsFound.length > 0 && (
              <div className="grid-2">
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
                          marginBottom: 8,
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
                            ? 'GGUF MAGIC HEADER VALID'
                            : 'UNVERIFIED HEADER'}
                        </span>
                      </div>

                      <div
                        className="font-display"
                        style={{
                          fontSize: '1.02rem',
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        {mod.name}
                      </div>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--ink-secondary)',
                          wordBreak: 'break-all',
                          marginBottom: 12,
                        }}
                      >
                        Path: {mod.fullPath} ({mod.sizeFormatted} •{' '}
                        {mod.architectureHint})
                      </div>

                      <button
                        type="button"
                        className={`clay-btn ${
                          isBound ? 'clay-btn-sage' : 'clay-btn-charcoal'
                        }`}
                        style={{
                          width: '100%',
                          padding: '9px 14px',
                          fontSize: '0.78rem',
                        }}
                        onClick={async () => {
                          setScanInputPath(mod.fullPath);
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

      {/* Bottom Section: Curated Offline Model Download Portal & Direct HuggingFace Links */}
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
          <div>
            <span className="clay-tag clay-tag-ochre">
              <Server size={14} />
              <span>
                OFFLINE MODEL DOWNLOAD PORTAL &amp; GUIDED INSTALLATION
                DIRECTORY
              </span>
            </span>
            <h2
              className="font-display"
              style={{ fontSize: '1.3rem', marginTop: 8 }}
            >
              Download Verified Small &amp; Medium GGUF Models
            </h2>
          </div>
          <p
            style={{
              fontSize: '0.84rem',
              color: 'var(--ink-secondary)',
              maxWidth: 520,
            }}
          >
            Click any portal link to download quantized .gguf files directly
            from HuggingFace, or copy the CLI command to pull into your local{' '}
            <code>./models</code> folder.
          </p>
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
                gap: 14,
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <span className="clay-tag clay-tag-cobalt">
                    {item.parameterSize} // {item.recommendedQuant}
                  </span>
                  <span className="clay-tag">
                    {item.fileSizeGb} ({item.minRamGb}GB RAM)
                  </span>
                </div>

                <h3
                  className="font-display"
                  style={{
                    fontSize: '1.02rem',
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  {item.name}
                </h3>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--ink-secondary)',
                  }}
                >
                  {item.description}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  className="clay-well font-mono"
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.73rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
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
                    style={{ padding: '4px 8px', fontSize: '0.68rem' }}
                    onClick={() =>
                      copyCommand(`${item.id}-ollama`, item.ollamaCommand)
                    }
                  >
                    {copiedId === `${item.id}-ollama` ? (
                      <Check size={12} />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>

                <div
                  className="clay-well font-mono"
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.71rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
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
                    style={{ padding: '4px 8px', fontSize: '0.68rem' }}
                    onClick={() =>
                      copyCommand(`${item.id}-hf`, item.hfCliCommand)
                    }
                  >
                    {copiedId === `${item.id}-hf` ? (
                      <Check size={12} />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                  }}
                >
                  <a
                    href={item.directGgufPortalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="clay-btn clay-btn-terracotta"
                    style={{
                      textDecoration: 'none',
                      padding: '9px 12px',
                      fontSize: '0.75rem',
                    }}
                  >
                    <ExternalLink size={13} />
                    <span>GGUF PORTAL</span>
                  </a>
                  <a
                    href={item.huggingFaceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="clay-btn"
                    style={{
                      textDecoration: 'none',
                      padding: '9px 12px',
                      fontSize: '0.75rem',
                    }}
                  >
                    <ExternalLink size={13} />
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
