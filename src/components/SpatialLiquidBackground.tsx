import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import anime from 'animejs';

interface SpatialLiquidBackgroundProps {
  active: boolean;
  flowIntensity?: 'calm' | 'dynamic';
}

/**
 * Replicates the exact 3D Glossy Liquid Glass Droplets, Mercury Amoeba Blobs,
 * and Deep Midnight Spatial Refraction Environment from the user's reference mockup.
 */
export const SpatialLiquidBackground: React.FC<
  SpatialLiquidBackgroundProps
> = ({ active, flowIntensity = 'dynamic' }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

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

    // Anime.js organic morphing on the main SVG amoeba paths
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
  }, [active, flowIntensity]);

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
        backgroundColor: '#070A12',
      }}
    >
      {/* Subtle Ambient Deep-Space Caustic Glows */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '12%',
          width: 620,
          height: 620,
          borderRadius: '50%',
          backgroundColor: 'rgba(32, 168, 212, 0.13)',
          filter: 'blur(120px)',
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
          backgroundColor: 'rgba(132, 78, 236, 0.13)',
          filter: 'blur(125px)',
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
          backgroundColor: 'rgba(24, 188, 204, 0.12)',
          filter: 'blur(130px)',
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
          {/* 1. Cyan-Sapphire-Violet Iridescent 3D Droplet Shader */}
          <radialGradient id="droplet-iridescent" cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor="rgba(220, 252, 255, 0.92)" />
            <stop offset="18%" stopColor="rgba(68, 224, 246, 0.78)" />
            <stop offset="52%" stopColor="rgba(66, 108, 238, 0.62)" />
            <stop offset="82%" stopColor="rgba(148, 72, 232, 0.55)" />
            <stop offset="100%" stopColor="rgba(16, 24, 48, 0.85)" />
          </radialGradient>

          {/* 2. Deep Aqua-Mercury 3D Droplet Shader */}
          <radialGradient id="droplet-aqua" cx="28%" cy="24%" r="74%">
            <stop offset="0%" stopColor="rgba(235, 254, 255, 0.95)" />
            <stop offset="22%" stopColor="rgba(58, 218, 238, 0.82)" />
            <stop offset="60%" stopColor="rgba(20, 96, 148, 0.68)" />
            <stop offset="100%" stopColor="rgba(8, 20, 38, 0.9)" />
          </radialGradient>

          {/* 3. Smoked Glass Mercury Bridge Shader */}
          <linearGradient id="mercury-bridge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(205, 245, 255, 0.75)" />
            <stop offset="35%" stopColor="rgba(64, 152, 214, 0.48)" />
            <stop offset="70%" stopColor="rgba(24, 38, 68, 0.78)" />
            <stop offset="100%" stopColor="rgba(156, 232, 252, 0.65)" />
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
              floodColor="rgba(64, 224, 248, 0.28)"
            />
          </filter>
        </defs>

        {/* A. Top-Center / Right Large Aqua-Teal 3D Sphere behind Header Banner */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <circle
            cx="1210"
            cy="38"
            r="68"
            fill="url(#droplet-aqua)"
            stroke="rgba(180, 250, 255, 0.65)"
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

        {/* B. Main Iridescent Cyan-Blue-Violet Liquid Amoeba Blob (Right of Header / Model Bar) */}
        <g
          className="liquid-3d-droplet anime-morph-blob"
          filter="url(#droplet-glow)"
          style={{ transformOrigin: '1360px 260px' }}
        >
          <path
            d="M1355,148 C1398,142 1432,178 1422,226 C1412,268 1438,312 1404,352 C1368,392 1284,386 1266,342 C1248,298 1296,268 1316,224 C1334,182 1318,154 1355,148 Z"
            fill="url(#droplet-iridescent)"
            stroke="rgba(195, 248, 255, 0.75)"
            strokeWidth="2"
          />
          {/* Glossy curved white water-droplet specular highlight */}
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
            stroke="rgba(110, 242, 255, 0.7)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>

        {/* C. Horizontal Stretched Liquid Mercury Droplet Bridging Header & Model Bar */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <path
            d="M956,254 C984,248 1032,262 1084,252 C1126,242 1158,224 1178,242 C1196,258 1184,292 1152,296 C1116,300 1076,278 1026,282 C984,286 944,294 936,276 C928,262 938,258 956,254 Z"
            fill="url(#mercury-bridge)"
            stroke="rgba(210, 250, 255, 0.8)"
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

        {/* D. Left Sidebar Edge Clinging Liquid Glass Droplets */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <circle
            cx="94"
            cy="258"
            r="26"
            fill="url(#droplet-aqua)"
            stroke="rgba(200, 252, 255, 0.85)"
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
            stroke="rgba(200, 252, 255, 0.8)"
            strokeWidth="1.2"
          />
        </g>

        {/* E. Bottom-Left Sidebar Organic Liquid Mercury Blob & Telemetry Bubbles */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <path
            d="M116,690 C148,684 176,724 166,772 C156,818 184,864 152,902 C122,936 74,918 68,874 C62,832 94,798 96,752 C98,716 92,694 116,690 Z"
            fill="url(#droplet-iridescent)"
            stroke="rgba(185, 248, 255, 0.72)"
            strokeWidth="1.8"
          />
          <path
            d="M112,708 C134,706 150,732 146,766"
            fill="none"
            stroke="rgba(255, 255, 255, 0.82)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Translucent Glass Bubbles near Telemetry Box */}
          <circle
            cx="332"
            cy="842"
            r="22"
            fill="url(#mercury-bridge)"
            stroke="rgba(205, 250, 255, 0.78)"
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
            stroke="rgba(205, 250, 255, 0.75)"
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

        {/* F. Right Middle Iridescent Violet-Aqua Droplet */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <path
            d="M1566,464 C1596,460 1618,492 1612,526 C1606,558 1574,578 1548,562 C1524,546 1528,512 1542,486 C1550,472 1554,466 1566,464 Z"
            fill="url(#droplet-iridescent)"
            stroke="rgba(205, 248, 255, 0.82)"
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

        {/* G. Lower-Center / Right Iridescent Sub-Surface Sphere */}
        <g className="liquid-3d-droplet" filter="url(#droplet-glow)">
          <circle
            cx="1325"
            cy="795"
            r="52"
            fill="url(#droplet-iridescent)"
            stroke="rgba(180, 245, 255, 0.55)"
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
