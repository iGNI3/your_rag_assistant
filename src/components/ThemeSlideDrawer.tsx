import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Sun, Orbit, Aperture, Palette, Check, Wind } from 'lucide-react';
import { COLOR_PALETTES, ColorPaletteId } from '../themePalettes';

interface ThemeSlideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: 'clay' | 'liquid-glass' | 'vision-ceramic';
  paletteId: ColorPaletteId;
  spatialFlow: 'calm' | 'dynamic';
  onChangeTheme: (mode: 'clay' | 'liquid-glass' | 'vision-ceramic') => void;
  onChangePalette: (id: ColorPaletteId) => void;
  onChangeSpatialFlow: (flow: 'calm' | 'dynamic') => void;
}

export const ThemeSlideDrawer: React.FC<ThemeSlideDrawerProps> = ({
  isOpen,
  onClose,
  themeMode,
  paletteId,
  spatialFlow,
  onChangeTheme,
  onChangePalette,
  onChangeSpatialFlow,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          {/* Click-outside crisp translucent scrim (Zero extra backdrop-blur pass) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(14, 16, 22, 0.42)',
            }}
          />

          {/* Floating Centered Theme & Palette Popup Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="clay-card theme-popup-card"
            style={{
              position: 'relative',
              zIndex: 101,
              width: '100%',
              maxWidth: 780,
              maxHeight: '86vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '26px 28px',
              overflow: 'hidden',
              backgroundColor:
                themeMode === 'liquid-glass'
                  ? 'rgba(252, 253, 255, 0.96)'
                  : undefined,
            }}
          >
            {/* Floating Popup Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                paddingBottom: 16,
                marginBottom: 18,
                borderBottom: '1.5px solid var(--clay-border-light)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    backgroundColor: 'var(--clay-terracotta)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-clay-terracotta)',
                  }}
                >
                  <Palette size={20} />
                </div>
                <div>
                  <h2
                    className="font-display"
                    style={{ fontSize: '1.2rem', fontWeight: 700 }}
                  >
                    Theme &amp; Color Palette
                  </h2>
                  <div
                    className="font-mono"
                    style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}
                  >
                    SELECT MATERIAL SYSTEM &amp; COLOR PALETTE
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="clay-btn"
                style={{ padding: '8px 10px' }}
                aria-label="Close Theme Popup"
              >
                <X size={16} />
              </button>
            </div>

            {/* Material System Row + Optional Spatial Flow Toggle */}
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
              <div
                className="clay-well"
                style={{
                  padding: 6,
                  borderRadius: 18,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => onChangeTheme('clay')}
                  className={`clay-btn ${
                    themeMode === 'clay' ? 'clay-btn-terracotta' : ''
                  }`}
                  style={{ padding: '9px 18px', fontSize: '0.8rem' }}
                >
                  <Sun size={15} />
                  <span>TACTILE CLAY</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeTheme('liquid-glass')}
                  className={`clay-btn ${
                    themeMode === 'liquid-glass' ? 'clay-btn-cobalt' : ''
                  }`}
                  style={{ padding: '9px 16px', fontSize: '0.78rem' }}
                >
                  <Orbit size={15} />
                  <span>LIQUID GLASS</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeTheme('vision-ceramic')}
                  className={`clay-btn ${
                    themeMode === 'vision-ceramic' ? 'clay-btn-sage' : ''
                  }`}
                  style={{ padding: '9px 16px', fontSize: '0.78rem' }}
                >
                  <Aperture size={15} />
                  <span>VISION CERAMIC</span>
                </button>
              </div>

              {themeMode === 'liquid-glass' && (
                <div
                  className="clay-well"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 16,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Wind size={14} />
                  <span
                    className="font-mono"
                    style={{ fontSize: '0.69rem', fontWeight: 700 }}
                  >
                    FLOW:
                  </span>
                  <button
                    type="button"
                    className={`clay-btn ${
                      spatialFlow === 'dynamic' ? 'clay-btn-sage' : ''
                    }`}
                    style={{ padding: '5px 10px', fontSize: '0.69rem' }}
                    onClick={() => onChangeSpatialFlow('dynamic')}
                  >
                    DYNAMIC
                  </button>
                  <button
                    type="button"
                    className={`clay-btn ${
                      spatialFlow === 'calm' ? 'clay-btn-sage' : ''
                    }`}
                    style={{ padding: '5px 10px', fontSize: '0.69rem' }}
                    onClick={() => onChangeSpatialFlow('calm')}
                  >
                    CALM
                  </button>
                </div>
              )}
            </div>

            {/* 3x3 Floating Color Palette Grid (All 9 Palettes Visible at Once) */}
            <div
              style={{
                overflowY: 'auto',
                paddingRight: 2,
              }}
            >
              <div className="grid-3" style={{ gap: 14 }}>
                {COLOR_PALETTES.map((pal) => {
                  const isSelected = pal.id === paletteId;
                  return (
                    <div
                      key={pal.id}
                      onClick={() => onChangePalette(pal.id)}
                      className="clay-card-alt"
                      style={{
                        cursor: 'pointer',
                        padding: '13px 14px',
                        borderColor: isSelected
                          ? 'var(--clay-terracotta)'
                          : 'var(--clay-border-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 9,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 6,
                        }}
                      >
                        <span
                          className="font-display"
                          style={{
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {pal.name}
                        </span>
                        {isSelected && (
                          <span
                            className="clay-tag clay-tag-sage"
                            style={{ padding: '2px 7px', fontSize: '0.62rem' }}
                          >
                            <Check size={10} />
                          </span>
                        )}
                      </div>

                      {/* Stacked Capsule Swatches */}
                      <div
                        className="clay-well"
                        style={{
                          padding: 5,
                          borderRadius: 12,
                          display: 'flex',
                          gap: 4,
                        }}
                      >
                        {pal.swatches.map((hex) => (
                          <div
                            key={hex}
                            title={hex}
                            style={{
                              flex: 1,
                              height: 26,
                              borderRadius: 7,
                              backgroundColor: hex,
                              border: '1.5px solid rgba(255,255,255,0.45)',
                              boxShadow:
                                'inset 1.5px 1.5px 2px rgba(255,255,255,0.35), inset -1.5px -1.5px 2px rgba(0,0,0,0.28)',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
