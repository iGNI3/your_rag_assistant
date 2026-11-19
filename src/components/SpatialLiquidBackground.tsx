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
 * Renders 3D Glossy Liquid Glass Droplets & Organic Mercury Amoeba Blobs
 * dynamically tinted by the active Color Palette's optical shader stops.
 */
export const SpatialLiquidBackground: React.FC<
  SpatialLiquidBackgroundProps
> = ({ active, flowIntensity = 'dynamic', palette }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const d = palette.liquidDroplets;

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const speedMult = flowIntensity === 'dynamic' ? 1 : 1.85;

    const blobs = containerRef.current.querySelectorAll('.liquid-3d-droplet');
    const ctx = gsap.context(() => {
      blobs.forEach((blob, idx) => {
        gsap.to(blob, {
          y: idx % 2 === 0 ? -18 : 16,
          x: idx % 3 === 0 ? 14 : -12,
          rotation: idx % 2 === 0 ? 6 : -5,
          scaleX: idx % 2 === 0 ? 1.04 : 0.96,
          scaleY: idx % 2 === 0 ? 0.96 : 1.04,
          duration: (5.5 + idx * 1.1) * speedMult,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });
    }, containerRef);

    const morphAnim = anime({
      targets: containerRef.current.querySelectorAll('.anime-morph-blob'),
      scale: [0.97, 1.04],
      duration: 4600 * speedMult,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    });

    return () => {
      ctx.revert();
      morphAnim.pause();
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
      {/* Palette-Driven Ambient Deep-Space Caustic Glows */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '12%',
          width: 620,
          height: 620,
          borderRadius: '50%',
          backgroundColor: d.glowA,
          filter: 'blur(120px)',
          transition: 'background-color 0.45s ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '18%',
          right: '8%',
          width: 560,
          height: 560,
          borderRadius: '50%',
          backgroundColor: d.glowB,
          filter: 'blur(125px)',
          transition: 'background-color 0.45s ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-12%',
          left: '35%',
          width: 680,
          height: 480,
          borderRadius: '50%',
          backgroundColor: d.glowC,
          filter: 'blur(130px)',
          transition: 'background-color 0.45s ease',
        }}
      />

      {/* Full-Viewport SVG Stage for 3D Glossy Liquid Glass Droplets & Amoeba Blobs */}
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
          <radialGradient id="droplet-iridescent" cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor={d.iridescentStops[0]} />
            <stop offset="20%" stopColor={d.iridescentStops[1]} />
            <stop offset="52%" stopColor={d.iridescentStops[2]} />
            <stop offset="82%" stopColor={d.iridescentStops[3]} />
            <stop offset="100%" stopColor={d.iridescentStops[4]} />
          </radialGradient>

          <radialGradient id="droplet-aqua" cx="28%" cy="24%" r="74%">
            <stop offset="0%" stopColor={d.aquaStops[0]} />
            <stop offset="24%" stopColor={d.aquaStops[1]} />
            <stop offset="62%" stopColor={d.aquaStops[2]} />
            <stop offset="100%" stopColor={d.aquaStops[3]} />
          </radialGradient>

          <linearGradient id="mercury-bridge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={d.bridgeStops[0]} />
            <stop offset="36%" stopColor={d.bridgeStops[1]} />
            <stop offset="72%" stopColor={d.bridgeStops[2]} />
            <stop offset="100%" stopColor={d.bridgeStops[3]} />
          </linearGradient>

          <filter id="droplet-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="14"
              stdDeviation="16"
              floodColor="rgba(0, 0, 0, 0.65)"
            />
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="12"
              floodColor={d.glowColor}
            />
          </filter>
        </defs>

        {/* A. Top-Right 3D Sphere behind Header Banner */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <circle
            cx="1210"
            cy="38"
            r="68"
            fill="url(#droplet-aqua)"
            stroke={d.rimStroke}
            strokeWidth="1.5"
          />
          <ellipse
            cx="1188"
            cy="16"
            rx="24"
            ry="11"
            transform="rotate(-24 1188 16)"
            fill="rgba(255, 255, 255, 0.78)"
          />
        </g>

        {/* B. Main Iridescent Liquid Amoeba Blob */}
        <g
          className="liquid-3d-droplet anime-morph-blob"
          filter="url(#droplet-glow)"
          style={{ transformOrigin: '1360px 260px' }}
        >
          <path
            d="M1355,148 C1398,142 1432,178 1422,226 C1412,268 1438,312 1404,352 C1368,392 1284,386 1266,342 C1248,298 1296,268 1316,224 C1334,182 1318,154 1355,148 Z"
            fill="url(#droplet-iridescent)"
            stroke={d.rimStroke}
            strokeWidth="2"
          />
          <path
            d="M1344,166 C1372,162 1396,184 1390,214"
            fill="none"
            stroke="rgba(255, 255, 255, 0.88)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M1284,324 C1292,352 1336,368 1374,354"
            fill="none"
            stroke={d.rimStroke}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>

        {/* C. Horizontal Stretched Liquid Mercury Droplet */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <path
            d="M956,254 C984,248 1032,262 1084,252 C1126,242 1158,224 1178,242 C1196,258 1184,292 1152,296 C1116,300 1076,278 1026,282 C984,286 944,294 936,276 C928,262 938,258 956,254 Z"
            fill="url(#mercury-bridge)"
            stroke={d.rimStroke}
            strokeWidth="1.8"
          />
          <path
            d="M954,264 C995,258 1055,266 1138,246"
            fill="none"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </g>

        {/* D. Left Sidebar Edge Clinging Liquid Droplets */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <circle
            cx="94"
            cy="258"
            r="26"
            fill="url(#droplet-aqua)"
            stroke={d.rimStroke}
            strokeWidth="1.8"
          />
          <ellipse
            cx="86"
            cy="248"
            rx="9"
            ry="5"
            transform="rotate(-28 86 248)"
            fill="rgba(255, 255, 255, 0.9)"
          />
          <circle
            cx="72"
            cy="292"
            r="10"
            fill="url(#droplet-aqua)"
            stroke={d.rimStroke}
            strokeWidth="1.2"
          />
        </g>

        {/* E. Bottom-Left Organic Liquid Blob & Telemetry Bubbles */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <path
            d="M116,690 C148,684 176,724 166,772 C156,818 184,864 152,902 C122,936 74,918 68,874 C62,832 94,798 96,752 C98,716 92,694 116,690 Z"
            fill="url(#droplet-iridescent)"
            stroke={d.rimStroke}
            strokeWidth="1.8"
          />
          <path
            d="M112,708 C134,706 150,732 146,766"
            fill="none"
            stroke="rgba(255, 255, 255, 0.82)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle
            cx="332"
            cy="842"
            r="22"
            fill="url(#mercury-bridge)"
            stroke={d.rimStroke}
            strokeWidth="1.5"
          />
          <ellipse
            cx="325"
            cy="834"
            rx="8"
            ry="4"
            transform="rotate(-25 325 834)"
            fill="rgba(255, 255, 255, 0.88)"
          />
          <circle
            cx="316"
            cy="888"
            r="17"
            fill="url(#mercury-bridge)"
            stroke={d.rimStroke}
            strokeWidth="1.4"
          />
          <ellipse
            cx="310"
            cy="882"
            rx="6"
            ry="3"
            transform="rotate(-25 310 882)"
            fill="rgba(255, 255, 255, 0.85)"
          />
        </g>

        {/* F. Right Middle Droplet */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <path
            d="M1566,464 C1596,460 1618,492 1612,526 C1606,558 1574,578 1548,562 C1524,546 1528,512 1542,486 C1550,472 1554,466 1566,464 Z"
            fill="url(#droplet-iridescent)"
            stroke={d.rimStroke}
            strokeWidth="1.8"
          />
          <path
            d="M1562,478 C1584,476 1598,496 1594,520"
            fill="none"
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>

        {/* G. Lower-Right Sub-Surface Sphere */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <circle
            cx="1325"
            cy="795"
            r="52"
            fill="url(#droplet-iridescent)"
            stroke={d.rimStroke}
            strokeWidth="1.5"
            opacity="0.82"
          />
          <ellipse
            cx="1308"
            cy="776"
            rx="18"
            ry="8"
            transform="rotate(-25 1308 776)"
            fill="rgba(255, 255, 255, 0.72)"
          />
        </g>
      </svg>
    </div>
  );
};
