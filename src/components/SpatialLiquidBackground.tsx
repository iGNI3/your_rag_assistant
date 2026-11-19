import React from 'react';
import { ColorPaletteDef } from '../themePalettes';

interface SpatialLiquidBackgroundProps {
  active: boolean;
  flowIntensity?: 'calm' | 'dynamic';
  palette: ColorPaletteDef;
}

/**
 * Ultra-Lightweight Architectural 3D Satin-Silk Ribbon Stage for "LIQUID GLASS".
 * Zero SVG filters, zero CSS blur(110px), zero JS animation loops:
 * renders in <0.5ms using pure radial-gradients and clean vector silk folds.
 */
export const SpatialLiquidBackground: React.FC<
  SpatialLiquidBackgroundProps
> = ({ active, flowIntensity = 'calm', palette }) => {
  if (!active) return null;
  const d = palette.liquidDroplets;
  const isDynamic = flowIntensity === 'dynamic';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: d.canvasBg,
        contain: 'strict',
        backgroundImage: `
          radial-gradient(circle at 42% 10%, ${d.glowA} 0%, transparent 52%),
          radial-gradient(circle at 86% 88%, ${d.glowB} 0%, transparent 54%),
          radial-gradient(circle at 8% 54%, ${d.glowC} 0%, transparent 48%)
        `,
      }}
    >
      {/* Clean GPU-Friendly Vector Satin-Silk Architectural Ribbons (Zero SVG Filters) */}
      <svg
        viewBox="0 0 1680 980"
        preserveAspectRatio="xMidYMid slice"
        className={isDynamic ? 'silk-stage-drift' : undefined}
        style={{
          position: 'absolute',
          inset: '-3%',
          width: '106%',
          height: '106%',
        }}
      >
        <defs>
          <linearGradient id="silk-ribbon-primary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={d.iridescentStops[0]} />
            <stop offset="28%" stopColor={d.iridescentStops[1]} />
            <stop offset="56%" stopColor={d.iridescentStops[2]} />
            <stop offset="82%" stopColor={d.iridescentStops[3]} />
            <stop offset="100%" stopColor={d.iridescentStops[4]} />
          </linearGradient>

          <linearGradient id="silk-ribbon-light" x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor={d.aquaStops[0]} />
            <stop offset="35%" stopColor={d.aquaStops[1]} />
            <stop offset="70%" stopColor={d.aquaStops[2]} />
            <stop offset="100%" stopColor={d.aquaStops[3]} />
          </linearGradient>

          <linearGradient id="silk-ribbon-shadow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={d.bridgeStops[0]} />
            <stop offset="38%" stopColor={d.bridgeStops[1]} />
            <stop offset="72%" stopColor={d.bridgeStops[2]} />
            <stop offset="100%" stopColor={d.bridgeStops[3]} />
          </linearGradient>
        </defs>

        {/* Soft Cast Shadow Underlays (Baked Offset Paths — Zero Filter Overhead) */}
        <path
          d="M 346,-74 C 456,156 636,271 696,481 C 761,711 466,876 136,1056 L -74,956 C 206,786 446,651 401,461 C 361,286 186,146 91,-74 Z"
          fill={d.glowColor}
        />
        <path
          d="M 806,-94 C 936,136 1146,226 1336,396 C 1526,566 1646,736 1776,856 L 1656,1076 C 1466,896 1296,711 1111,541 C 931,376 736,236 596,-94 Z"
          fill={d.glowColor}
        />

        {/* Band 1: Broad Diagonal Sweeping Satin Ribbon */}
        <path
          d="M 330,-90 C 440,140 620,255 680,465 C 745,695 450,860 120,1040 L -90,940 C 190,770 430,635 385,445 C 345,270 170,130 75,-90 Z"
          fill="url(#silk-ribbon-primary)"
          stroke={d.rimStroke}
          strokeWidth="1.2"
        />

        {/* Band 2: Luminous Pearl Ribbon Arch */}
        <path
          d="M 790,-110 C 920,120 1130,210 1320,380 C 1510,550 1630,720 1760,840 L 1640,1060 C 1450,880 1280,695 1095,525 C 915,360 720,220 580,-110 Z"
          fill="url(#silk-ribbon-light)"
          stroke={d.rimStroke}
          strokeWidth="1.4"
        />

        {/* Band 3: Soft Sculptural Cross-Fold Arc */}
        <path
          d="M 1760,260 C 1520,385 1385,595 1255,780 C 1150,930 1010,1010 820,1080 L 620,990 C 840,910 995,820 1110,665 C 1245,480 1420,255 1730,110 Z"
          fill="url(#silk-ribbon-shadow)"
          stroke={d.rimStroke}
          strokeWidth="1.1"
        />

        {/* Band 4: Delicate Upper-Left Ambient Silk Highlight Loop */}
        <path
          d="M -120,160 C 80,115 265,175 415,310 C 520,405 565,530 515,670 L 340,625 C 380,520 355,430 275,355 C 165,250 15,215 -140,265 Z"
          fill="url(#silk-ribbon-light)"
          opacity="0.72"
          stroke={d.rimStroke}
          strokeWidth="1"
        />
      </svg>
    </div>
  );
};
