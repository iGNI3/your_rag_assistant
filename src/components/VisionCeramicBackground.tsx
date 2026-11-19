import React from 'react';
import { ColorPaletteDef } from '../themePalettes';

interface VisionCeramicBackgroundProps {
  active: boolean;
  palette: ColorPaletteDef;
}

/**
 * Ultra-Lightweight Architectural Porcelain & Sculptural Studio Backdrop for "VISION CERAMIC".
 * Zero continuous JS animation loops and zero CSS blur(110px) filters — renders as a static
 * GPU-friendly gallery studio composition in <0.5ms.
 */
export const VisionCeramicBackground: React.FC<
  VisionCeramicBackgroundProps
> = ({ active, palette }) => {
  if (!active) return null;
  const c = palette.ceramicStage;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: c.studioCanvas,
        contain: 'strict',
        backgroundImage: `
          radial-gradient(circle at 96% 4%, ${c.sunlightWash} 0%, transparent 42%),
          radial-gradient(circle at 6% 52%, ${c.warmWash} 0%, transparent 46%)
        `,
      }}
    >
      {/* Top-Right Warm Diffused Studio Sun Orb (Clean Radial Gradient, Zero Heavy Blur) */}
      <div
        style={{
          position: 'absolute',
          top: '-120px',
          right: '-90px',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 38% 38%, #FFFDF8 0%, #F9F3E9 68%, rgba(235, 224, 210, 0.85) 100%)',
          boxShadow: '0 18px 42px rgba(42, 36, 28, 0.08)',
        }}
      />

      {/* Top-Left Sculpted Matte Stone Pebble Sphere */}
      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 34,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: `radial-gradient(circle at 32% 28%, #FFFFFF 0%, ${c.stoneSphere} 56%, #9E9B95 100%)`,
          boxShadow: '14px 20px 32px rgba(40, 38, 34, 0.14)',
        }}
      />

      {/* Right-Edge Sculpted Plaster Sphere */}
      <div
        style={{
          position: 'absolute',
          top: '36%',
          right: -75,
          width: 185,
          height: 185,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 30% 30%, #FFFFFF 0%, #E8E6E1 60%, #C8C4BD 100%)',
          boxShadow: '-10px 16px 32px rgba(34, 34, 32, 0.1)',
        }}
      />

      {/* Sculpted Ceramic Accent Pebbles near Bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 42,
          right: 92,
          width: 50,
          height: 50,
          borderRadius: '50%',
          background: `radial-gradient(circle at 32% 30%, #FFF4E6 0%, ${c.accentOrb} 58%, rgba(120, 52, 12, 0.85) 100%)`,
          boxShadow: '6px 10px 18px rgba(40, 32, 24, 0.16)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 58,
          right: 174,
          width: 44,
          height: 24,
          borderRadius: 999,
          transform: 'rotate(-24deg)',
          backgroundColor: c.primaryPebble,
          boxShadow: '4px 8px 14px rgba(12, 56, 40, 0.18)',
        }}
      />

      {/* Minimalist Architectural Porcelain Plinth Horizon along Bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '5%',
          right: '5%',
          height: 26,
          borderTopLeftRadius: 999,
          borderTopRightRadius: 999,
          backgroundColor: 'rgba(255, 255, 255, 0.76)',
          borderTop: '1px solid rgba(255, 255, 255, 0.95)',
          boxShadow: '0 -8px 24px rgba(30, 32, 30, 0.06)',
        }}
      />
    </div>
  );
};
