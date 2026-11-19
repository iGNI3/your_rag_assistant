import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Sun, Orbit, Palette, Check, Wind } from 'lucide-react';
import { COLOR_PALETTES, ColorPaletteId } from '../themePalettes';

interface ThemeSlideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: 'clay' | 'liquid-glass';
  paletteId: ColorPaletteId;
  spatialFlow: 'calm' | 'dynamic';
  onChangeTheme: (mode: 'clay' | 'liquid-glass') => void;
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
        <>
          {/* Click-outside subtle backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 90,
              backgroundColor: 'rgba(10, 14, 22, 0.36)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />

          {/* Slide-Over Popup Drawer */}
          <motion.aside
            initial={{ x: '105%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '105%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 310, damping: 32 }}
            className="clay-card"
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              bottom: 20,
              width: '100%',
              maxWidth: 440,
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              padding: '24px 24px 20px',
              overflow: 'hidden',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 16,
                marginBottom: 18,
                borderBottom: '1.5px solid var(--clay-border-light)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 13,
                    backgroundColor: 'var(--clay-terracotta)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-clay-terracotta)',
                  }}
                >
                  <Palette size={19} />
                </div>
                <div>
                  <h2
                    className="font-display"
                    style={{ fontSize: '1.16rem', fontWeight: 700 }}
                  >
                    Theme &amp; Palette Studio
                  </h2>
                  <div
                    className="font-mono"
                    style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}
                  >
                    LIVE MATERIAL &amp; COLOR PREVIEW
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="clay-btn"
                style={{ padding: '8px 10px' }}
                aria-label="Close Theme Drawer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                paddingRight: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              {/* Section 1: Material Mode */}
              <div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: 'var(--ink-muted)',
                    marginBottom: 10,
                    letterSpacing: '0.06em',
                  }}
                >
                  01 // MATERIAL SYSTEM
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onChangeTheme('clay')}
                    className={`clay-btn ${
                      themeMode === 'clay' ? 'clay-btn-terracotta' : ''
                    }`}
                    style={{
                      flexDirection: 'column',
                      padding: '16px 12px',
                      gap: 8,
                    }}
                  >
                    <Sun size={20} />
                    <span>TACTILE CLAY</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onChangeTheme('liquid-glass')}
                    className={`clay-btn ${
                      themeMode === 'liquid-glass' ? 'clay-btn-cobalt' : ''
                    }`}
                    style={{
                      flexDirection: 'column',
                      padding: '16px 12px',
                      gap: 8,
                    }}
                  >
                    <Orbit size={20} />
                    <span>LIQUID GLASS</span>
                  </button>
                </div>

                {/* Spatial Flow Speed Toggle (Only shown in Liquid Glass) */}
                {themeMode === 'liquid-glass' && (
                  <div
                    className="clay-well"
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                      }}
                    >
                      <Wind size={14} />
                      <span>3D Droplet Flow</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className={`clay-btn ${
                          spatialFlow === 'dynamic' ? 'clay-btn-sage' : ''
                        }`}
                        style={{ padding: '5px 11px', fontSize: '0.7rem' }}
                        onClick={() => onChangeSpatialFlow('dynamic')}
                      >
                        DYNAMIC
                      </button>
                      <button
                        type="button"
                        className={`clay-btn ${
                          spatialFlow === 'calm' ? 'clay-btn-sage' : ''
                        }`}
                        style={{ padding: '5px 11px', fontSize: '0.7rem' }}
                        onClick={() => onChangeSpatialFlow('calm')}
                      >
                        CALM
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: 9 Curated Color Palettes */}
              <div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: 'var(--ink-muted)',
                    marginBottom: 10,
                    letterSpacing: '0.06em',
                  }}
                >
                  02 // COLOR PALETTES ({COLOR_PALETTES.length})
                </div>

                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  {COLOR_PALETTES.map((pal) => {
                    const isSelected = pal.id === paletteId;
                    return (
                      <motion.div
                        key={pal.id}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => onChangePalette(pal.id)}
                        className="clay-card-alt"
                        style={{
                          cursor: 'pointer',
                          padding: '14px 16px',
                          borderColor: isSelected
                            ? 'var(--clay-terracotta)'
                            : 'var(--clay-border-light)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span
                            className="font-display"
                            style={{ fontSize: '0.94rem', fontWeight: 700 }}
                          >
                            {pal.name}
                          </span>
                          {isSelected && (
                            <span
                              className="clay-tag clay-tag-sage"
                              style={{ padding: '3px 9px', fontSize: '0.65rem' }}
                            >
                              <Check size={11} />
                              <span>ACTIVE</span>
                            </span>
                          )}
                        </div>

                        {/* Stacked Capsule Swatches */}
                        <div
                          className="clay-well"
                          style={{
                            padding: 6,
                            borderRadius: 14,
                            display: 'flex',
                            gap: 5,
                          }}
                        >
                          {pal.swatches.map((hex) => (
                            <div
                              key={hex}
                              title={hex}
                              style={{
                                flex: 1,
                                height: 28,
                                borderRadius: 8,
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
                            fontSize: '0.66rem',
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
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
