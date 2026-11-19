import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ColorPaletteDef } from '../themePalettes';

interface VisionCeramicBackgroundProps {
  active: boolean;
  palette: ColorPaletteDef;
}

/**
 * Architectural Porcelain & Sculptural Studio Gallery Backdrop for the "VISION CERAMIC" theme.
 * Inspired by Apple Vision Pro editorial ceramic studio compositions:
 * warm sunlit gallery backdrop, matte sculpted stone spheres, soft apricot light wash,
 * and floating minimalist ceramic accent pebbles.
 */
export const VisionCeramicBackground: React.FC<
  VisionCeramicBackgroundProps
> = ({ active, palette }) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const c = palette.ceramicStage;

  useEffect(() => {
    if (!active || !stageRef.current) return;
    const orbs = stageRef.current.querySelectorAll('.ceramic-float-prop');
    const ctx = gsap.context(() => {
      orbs.forEach((el, idx) => {
        gsap.to(el, {
          y: idx % 2 === 0 ? -14 : 12,
          x: idx % 3 === 0 ? 10 : -8,
          rotation: idx % 2 === 0 ? 5 : -4,
          duration: 6.5 + idx * 1.4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });
    }, stageRef);

    return () => ctx.revert();
  }, [active, palette.id]);

  if (!active) return null;

  return (
    <div
      ref={stageRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: c.studioCanvas,
        transition: 'background-color 0.45s ease',
      }}
    >
      {/* Top-Right Warm Diffused Studio Sun Orb */}
      <div
        className="ceramic-float-prop"
        style={{
          position: 'absolute',
          top: '-120px',
          right: '-90px',
          width: 420,
          height: 420,
          borderRadius: '50%',
          backgroundColor: '#FFFDF8',
          boxShadow: `0 0 110px 45px ${c.sunlightWash}, inset -16px -18px 40px rgba(226, 214, 198, 0.55)`,
        }}
      />

      {/* Left-Middle Soft Warm Apricot / Accent Ambient Light Wash */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '-12%',
          width: 560,
          height: 560,
          borderRadius: '50%',
          backgroundColor: c.warmWash,
          filter: 'blur(110px)',
        }}
      />

      {/* Top-Left Sculpted Matte Stone Pebble Sphere (From Reference Composition) */}
      <div
        className="ceramic-float-prop"
        style={{
          position: 'absolute',
          top: 28,
          left: 34,
          width: 124,
          height: 124,
          borderRadius: '50%',
          backgroundColor: c.stoneSphere,
          boxShadow:
            '18px 24px 42px rgba(40, 38, 34, 0.16), inset 14px 14px 26px rgba(255, 255, 255, 0.72), inset -16px -18px 28px rgba(96, 92, 86, 0.34)',
        }}
      />

      {/* Right-Edge Sculpted Plaster Sphere */}
      <div
        className="ceramic-float-prop"
        style={{
          position: 'absolute',
          top: '36%',
          right: -75,
          width: 190,
          height: 190,
          borderRadius: '50%',
          backgroundColor: '#E8E6E1',
          boxShadow:
            '-14px 20px 42px rgba(34, 34, 32, 0.12), inset 18px 14px 32px rgba(255, 255, 255, 0.85), inset -14px -16px 28px rgba(130, 126, 120, 0.22)',
        }}
      />

      {/* Subtle Floating Emerald & Apricot Ceramic Accent Pebbles near Bottom */}
      <div
        className="ceramic-float-prop"
        style={{
          position: 'absolute',
          bottom: 42,
          right: 92,
          width: 52,
          height: 52,
          borderRadius: '50%',
          backgroundColor: c.accentOrb,
          boxShadow:
            '8px 14px 24px rgba(180, 96, 30, 0.25), inset 6px 6px 12px rgba(255, 232, 206, 0.72), inset -6px -8px 12px rgba(140, 62, 12, 0.35)',
        }}
      />

      <div
        className="ceramic-float-prop"
        style={{
          position: 'absolute',
          bottom: 58,
          right: 174,
          width: 44,
          height: 24,
          borderRadius: 999,
          transform: 'rotate(-24deg)',
          backgroundColor: c.primaryPebble,
          boxShadow:
            '6px 12px 20px rgba(12, 88, 62, 0.24), inset 4px 4px 8px rgba(168, 240, 212, 0.55)',
        }}
      />

      {/* Minimalist Architectural Porcelain Plinth Horizon along Bottom */}
      <div
        style={{
          position: 'absolute',
          left: '4%',
          right: '4%',
          bottom: -24,
          height: 64,
          borderRadius: '50% 50% 0 0',
          backgroundColor: '#F3F2EF',
          borderTop: '1.5px solid rgba(255, 255, 255, 0.95)',
          boxShadow: '0 -12px 34px rgba(28, 30, 28, 0.07)',
        }}
      />
    </div>
  );
};
