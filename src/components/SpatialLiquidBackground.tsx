import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import anime from 'animejs';
import { ColorPaletteDef } from '../themePalettes';

interface SpatialLiquidBackgroundProps {
  active: boolean;
  flowIntensity?: 'calm' | 'dynamic';
  palette: ColorPaletteDef;
}

/**
 * Architectural 3D Satin-Silk Ribbon & Luminous Frosted Crystal Stage
 * for the refactored "LIQUID GLASS" theme (matching the iDraft frosted crystal studio aesthetic).
 * Renders sweeping sculpted 3D monochrome/palette-harmonized silk folds behind the floating crystal OS pane.
 */
export const SpatialLiquidBackground: React.FC<
  SpatialLiquidBackgroundProps
> = ({ active, flowIntensity = 'dynamic', palette }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const d = palette.liquidDroplets;

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const speedMult = flowIntensity === 'dynamic' ? 1 : 1.9;

    const ribbons = containerRef.current.querySelectorAll('.silk-ribbon-band');
    const ctx = gsap.context(() => {
      ribbons.forEach((band, idx) => {
        gsap.to(band, {
          y: idx % 2 === 0 ? -16 : 14,
          x: idx % 2 === 0 ? 12 : -14,
          rotation: idx % 2 === 0 ? 1.4 : -1.2,
          duration: (8.5 + idx * 1.8) * speedMult,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });
    }, containerRef);

    const breatheAnim = anime({
      targets: containerRef.current.querySelectorAll('.silk-light-bloom'),
      opacity: [0.55, 0.9],
      scale: [0.97, 1.03],
      duration: 6200 * speedMult,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    });

    return () => {
      ctx.revert();
      breatheAnim.pause();
    };
  }, [active, flowIntensity, palette.id]);

  if (!active) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: d.canvasBg,
        transition: 'background-color 0.45s ease',
      }}
    >
      {/* Soft Studio Directional Light Blooms (Architectural Paper / Silk Lighting) */}
      <div
        className="silk-light-bloom"
        style={{
          position: 'absolute',
          top: '-14%',
          left: '28%',
          width: 780,
          height: 620,
          borderRadius: '50%',
          backgroundColor: d.glowA,
          filter: 'blur(110px)',
          transition: 'background-color 0.45s ease',
        }}
      />
      <div
        className="silk-light-bloom"
        style={{
          position: 'absolute',
          bottom: '-18%',
          right: '6%',
          width: 740,
          height: 580,
          borderRadius: '50%',
          backgroundColor: d.glowB,
          filter: 'blur(120px)',
          transition: 'background-color 0.45s ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '35%',
          left: '-10%',
          width: 560,
          height: 560,
          borderRadius: '50%',
          backgroundColor: d.glowC,
          filter: 'blur(115px)',
          transition: 'background-color 0.45s ease',
        }}
      />

      {/* Full-Viewport SVG Stage: Sweeping 3D Sculpted Satin-Silk Architectural Ribbons */}
      <svg
        viewBox="0 0 1680 980"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <defs>
          {/* Main Sweeping Satin Ribbon Gradient (Pearl -> Brushed Silver -> Soft Graphite Fold) */}
          <linearGradient id="silk-ribbon-primary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={d.iridescentStops[0]} />
            <stop offset="28%" stopColor={d.iridescentStops[1]} />
            <stop offset="56%" stopColor={d.iridescentStops[2]} />
            <stop offset="82%" stopColor={d.iridescentStops[3]} />
            <stop offset="100%" stopColor={d.iridescentStops[4]} />
          </linearGradient>

          {/* Secondary Luminous Fold Gradient */}
          <linearGradient id="silk-ribbon-light" x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor={d.aquaStops[0]} />
            <stop offset="35%" stopColor={d.aquaStops[1]} />
            <stop offset="70%" stopColor={d.aquaStops[2]} />
            <stop offset="100%" stopColor={d.aquaStops[3]} />
          </linearGradient>

          {/* Deep Architectural Shadow Fold Gradient */}
          <linearGradient id="silk-ribbon-shadow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={d.bridgeStops[0]} />
            <stop offset="38%" stopColor={d.bridgeStops[1]} />
            <stop offset="72%" stopColor={d.bridgeStops[2]} />
            <stop offset="100%" stopColor={d.bridgeStops[3]} />
          </linearGradient>

          {/* Soft Diffused Studio Cast Shadow for 3D Ribbon Elevation */}
          <filter id="silk-fold-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="10"
              dy="26"
              stdDeviation="24"
              floodColor={d.glowColor}
            />
          </filter>
        </defs>

        {/* Band 1: Broad Diagonal Sweeping Satin Ribbon (Top-Center to Bottom-Left, matching iDraft upper fold) */}
        <g
          className="silk-ribbon-band"
          filter="url(#silk-fold-shadow)"
          style={{ transformOrigin: '620px 380px' }}
        >
          <path
            d="M 330,-90 C 440,140 620,255 680,465 C 745,695 450,860 120,1040 L -90,940 C 190,770 430,635 385,445 C 345,270 170,130 75,-90 Z"
            fill="url(#silk-ribbon-primary)"
            stroke={d.rimStroke}
            strokeWidth="1.2"
          />
        </g>

        {/* Band 2: Luminous Pearl Ribbon Arch (Top-Center Sweeping Right & Downward) */}
        <g
          className="silk-ribbon-band"
          filter="url(#silk-fold-shadow)"
          style={{ transformOrigin: '1080px 340px' }}
        >
          <path
            d="M 790,-110 C 920,120 1130,210 1320,380 C 1510,550 1630,720 1760,840 L 1640,1060 C 1450,880 1280,695 1095,525 C 915,360 720,220 580,-110 Z"
            fill="url(#silk-ribbon-light)"
            stroke={d.rimStroke}
            strokeWidth="1.4"
          />
        </g>

        {/* Band 3: Soft Sculptural Cross-Fold Arc (Right-Mid to Bottom-Center) */}
        <g
          className="silk-ribbon-band"
          filter="url(#silk-fold-shadow)"
          style={{ transformOrigin: '1120px 760px' }}
        >
          <path
            d="M 1760,260 C 1520,385 1385,595 1255,780 C 1150,930 1010,1010 820,1080 L 620,990 C 840,910 995,820 1110,665 C 1245,480 1420,255 1730,110 Z"
            fill="url(#silk-ribbon-shadow)"
            stroke={d.rimStroke}
            strokeWidth="1.1"
          />
        </g>

        {/* Band 4: Delicate Upper-Left Ambient Silk Highlight Loop */}
        <g
          className="silk-ribbon-band"
          style={{ transformOrigin: '240px 210px' }}
        >
          <path
            d="M -120,160 C 80,115 265,175 415,310 C 520,405 565,530 515,670 L 340,625 C 380,520 355,430 275,355 C 165,250 15,215 -140,265 Z"
            fill="url(#silk-ribbon-light)"
            opacity="0.72"
            stroke={d.rimStroke}
            strokeWidth="1"
          />
        </g>
      </svg>
    </div>
  );
};
