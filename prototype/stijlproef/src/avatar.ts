// Illustrated flat avatars (generic characters, not real people): Ria (tutorial), Sap (adviser) and de Rotterdammert (mood).

export const RIA_SVG = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="riaClip"><circle cx="60" cy="60" r="56"/></clipPath>
    <linearGradient id="riaBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0e6"/><stop offset="1" stop-color="#8fc3cc"/></linearGradient>
  </defs>
  <circle cx="60" cy="60" r="58" fill="#fff6e4"/>
  <circle cx="60" cy="60" r="55" fill="url(#riaBg)"/>
  <g clip-path="url(#riaClip)">
    <path d="M0 78 V62 h12 v-10 h10 v14 h8 v-20 h12 v26 h10 v-12 h10 v18z" fill="#fff" opacity=".28"/>
    <path d="M14 124 C16 96 34 88 60 88 C86 88 104 96 106 124z" fill="#e98a52"/>
    <path d="M44 90 L60 108 L76 90 C70 87 66 86 60 86 C54 86 50 87 44 90z" fill="#f6ead2"/>
    <rect x="26" y="106" width="68" height="6" fill="#f6ead2" opacity=".9"/>
    <path d="M60 108 V124" stroke="#c9703c" stroke-width="2"/>
    <path d="M50 88 L60 106 L70 88" fill="none" stroke="#2f6f7e" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="55.5" y="106" width="9" height="11" rx="2" fill="#fff" stroke="#2f6f7e" stroke-width="1.6"/>
    <rect x="52" y="78" width="16" height="14" rx="6" fill="#e6b08e"/>
    <path d="M27 58 C24 36 38 24 60 24 C82 24 96 36 93 58 C92 72 88 80 84 84 L36 84 C32 80 28 72 27 58z" fill="#8c7a6e"/>
    <ellipse cx="60" cy="57" rx="23" ry="26" fill="#f4c9a6"/>
    <path d="M32 46 C32 26 46 17 60 17 C74 17 88 26 88 46 Z" fill="#f2bb45"/>
    <rect x="28" y="43" width="64" height="8" rx="4" fill="#e3a62d"/>
    <rect x="55" y="12" width="10" height="9" rx="3" fill="#f2bb45"/>
    <circle cx="60" cy="32" r="8" fill="#2f6f7e"/>
    <text x="60" y="37.2" text-anchor="middle" font-family="Fredoka Variable, system-ui, sans-serif" font-weight="700" font-size="12" fill="#fff6e4">P</text>
    <path d="M33 52 C31 62 32 72 36 78 C34 70 36 60 38 52z" fill="#8c7a6e"/>
    <path d="M87 52 C89 62 88 72 84 78 C86 70 84 60 82 52z" fill="#8c7a6e"/>
    <g fill="none" stroke="#3b4a58" stroke-width="2.2"><rect x="40" y="55" width="16" height="12" rx="5"/><rect x="64" y="55" width="16" height="12" rx="5"/><path d="M56 60.5 h8"/></g>
    <circle cx="48" cy="61" r="2.2" fill="#3b4a58"/><circle cx="72" cy="61" r="2.2" fill="#3b4a58"/>
    <path d="M43 52 q5 -3 10 -1 M67 51 q5 -2 10 1" stroke="#6b5a4e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="42" cy="71" rx="4.5" ry="3" fill="#ee9a8a" opacity=".55"/><ellipse cx="78" cy="71" rx="4.5" ry="3" fill="#ee9a8a" opacity=".55"/>
    <path d="M52 74 Q60 82 68 74" fill="#fff" stroke="#8a4b45" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <circle cx="60" cy="60" r="55" fill="none" stroke="#fff6e4" stroke-width="4"/>
</svg>`;

/** Sap: 65, former MT member, wise and dry-humoured adviser. Grey short hair, glasses on a cord, plum blazer. */
export const SAP_SVG = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="sapClip"><circle cx="60" cy="60" r="56"/></clipPath>
    <linearGradient id="sapBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6dcc4"/><stop offset="1" stop-color="#cdbf9f"/></linearGradient>
  </defs>
  <circle cx="60" cy="60" r="58" fill="#fff6e4"/>
  <circle cx="60" cy="60" r="55" fill="url(#sapBg)"/>
  <g clip-path="url(#sapClip)">
    <!-- bookshelf hint -->
    <g opacity=".35"><rect x="6" y="20" width="108" height="3" fill="#8a7550"/><rect x="12" y="8" width="6" height="12" fill="#a33a3a"/><rect x="19" y="10" width="5" height="10" fill="#2f6f7e"/><rect x="25" y="7" width="7" height="13" fill="#e0a43a"/><rect x="92" y="9" width="6" height="11" fill="#2f6f7e"/><rect x="99" y="7" width="5" height="13" fill="#a33a3a"/></g>
    <!-- blazer -->
    <path d="M10 124 C12 98 32 88 60 88 C88 88 108 98 110 124z" fill="#7a3e5c"/>
    <path d="M44 90 L60 112 L76 90 C70 87 66 86 60 86 C54 86 50 87 44 90z" fill="#f4ecdc"/>
    <path d="M44 90 L56 124 L36 124 C34 108 38 96 44 90z" fill="#693350"/><path d="M76 90 L64 124 L84 124 C86 108 82 96 76 90z" fill="#693350"/>
    <circle cx="60" cy="118" r="2" fill="#e9d6a6"/>
    <!-- brooch -->
    <circle cx="82" cy="102" r="3.2" fill="#e9d6a6"/><circle cx="82" cy="102" r="1.4" fill="#2f6f7e"/>
    <!-- neck -->
    <rect x="52" y="78" width="16" height="14" rx="6" fill="#e8bd9b"/>
    <!-- hair back -->
    <path d="M30 60 C26 36 40 22 60 22 C80 22 94 36 90 60 C90 66 88 70 86 72 L34 72 C32 70 30 66 30 60z" fill="#b8bcc4"/>
    <!-- face -->
    <ellipse cx="60" cy="58" rx="22" ry="25" fill="#f2c7a4"/>
    <!-- hair front: short, swept to the side -->
    <path d="M36 52 C34 34 46 24 62 24 C78 24 88 34 84 52 C80 42 70 36 58 38 C48 40 40 44 36 52z" fill="#c9cdd4"/>
    <path d="M40 40 C48 32 62 30 72 34" stroke="#a9aeb8" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- ears + earrings -->
    <ellipse cx="38" cy="60" rx="3" ry="4.4" fill="#eab995"/><ellipse cx="82" cy="60" rx="3" ry="4.4" fill="#eab995"/>
    <circle cx="38" cy="65.5" r="1.7" fill="#f6f1e6"/><circle cx="82" cy="65.5" r="1.7" fill="#f6f1e6"/>
    <!-- eyes: sharp, slightly hooded -->
    <path d="M44 58 q5 -3.6 10 0" stroke="#4b3f3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M66 58 q5 -3.6 10 0" stroke="#4b3f3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <ellipse cx="49" cy="60" rx="3" ry="2.6" fill="#fffaf0"/><ellipse cx="71" cy="60" rx="3" ry="2.6" fill="#fffaf0"/>
    <circle cx="49.6" cy="60.2" r="1.7" fill="#3a4a5a"/><circle cx="71.6" cy="60.2" r="1.7" fill="#3a4a5a"/>
    <!-- brows: one a bit raised (dry) -->
    <path d="M43 52.4 q6 -3 11 -0.6" stroke="#8d9097" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M66 49.8 q6 -3.4 11 -0.4" stroke="#8d9097" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <!-- glasses + cord -->
    <g fill="none" stroke="#7a3e5c" stroke-width="2"><rect x="42" y="55" width="15" height="12" rx="5.5"/><rect x="63" y="55" width="15" height="12" rx="5.5"/><path d="M57 60 q3 -2 6 0"/></g>
    <path d="M42 60 L38 58 M78 60 L82 58" stroke="#7a3e5c" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M38 58 C30 70 34 96 48 104 M82 58 C90 70 86 96 72 104" fill="none" stroke="#c9a04a" stroke-width="1.5" stroke-dasharray="1.2 2.2" stroke-linecap="round"/>
    <!-- nose, smile lines, dry smile -->
    <path d="M60 62 q-2 6 1 8" stroke="#c99677" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M49 74 Q58 79 70 73" stroke="#9a4f4a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M70 73 q2.4 -0.6 3 -2.4" stroke="#9a4f4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M42 68 q-2 3 0 6 M78 68 q2 3 0 6" stroke="#d9a888" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <ellipse cx="46" cy="70" rx="4" ry="2.6" fill="#ee9a8a" opacity=".4"/><ellipse cx="74" cy="70" rx="4" ry="2.6" fill="#ee9a8a" opacity=".4"/>
  </g>
  <circle cx="60" cy="60" r="55" fill="none" stroke="#fff6e4" stroke-width="4"/>
</svg>`;

/** De Rotterdammer: flat, friendly, diverse/generic. Expression is driven by Hud.drawFace via element ids. */
export const ROTTERDAMMERT_SVG = `
<svg id="face" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="De Rotterdammert">
  <defs>
    <clipPath id="rcClip"><circle cx="50" cy="50" r="41"/></clipPath>
    <clipPath id="clipL"><ellipse cx="40" cy="50" rx="5.6" ry="6.2"/></clipPath>
    <clipPath id="clipR"><ellipse cx="60" cy="50" rx="5.6" ry="6.2"/></clipPath>
  </defs>
  <circle cx="50" cy="52" r="42" fill="rgba(30,45,60,.18)" transform="translate(0,3)"/>
  <circle id="ring" cx="50" cy="50" r="46" fill="none" stroke="var(--brand)" stroke-width="4.5" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" transform="rotate(-90 50 50)"/>
  <circle cx="50" cy="50" r="41" id="rcBg" fill="#cfe6d6"/>
  <g clip-path="url(#rcClip)">
    <path d="M0 74 V62 h9 v-8 h8 v11 h6 v-15 h9 v20 h8 v-9 h8 v13z" fill="#fff" opacity=".35"/>
    <!-- jacket (Rotterdam green) with collar + zip -->
    <path d="M8 104 C10 82 28 76 50 76 C72 76 90 82 92 104z" fill="var(--brand)"/>
    <path d="M36 78 L50 92 L64 78 C58 75 55 74.5 50 74.5 C45 74.5 42 75 36 78z" fill="#f4ecdc"/>
    <path d="M50 92 V104" stroke="#005f17" stroke-width="1.8"/>
    <rect x="18" y="94" width="64" height="3" fill="#ffffff" opacity=".7"/>
    <!-- neck -->
    <rect x="43" y="66" width="14" height="13" rx="5" fill="#9a6444"/>
    <!-- ears -->
    <ellipse cx="27.5" cy="52" rx="3.4" ry="5" fill="#a86b49"/><ellipse cx="72.5" cy="52" rx="3.4" ry="5" fill="#a86b49"/>
    <!-- head -->
    <ellipse cx="50" cy="50" rx="22" ry="25" fill="#b87650"/>
    <!-- beanie -->
    <path d="M27 42 C26 22 38 13 50 13 C62 13 74 22 73 42 C66 37 58 35 50 35 C42 35 34 37 27 42z" fill="#3a4a5c"/>
    <rect x="26" y="37" width="48" height="8" rx="4" fill="#2c3a4a"/>
    <path d="M30 41 H70" stroke="#ffffff" stroke-width="1.6" opacity=".55" stroke-dasharray="3 3"/>
    <circle cx="50" cy="11.5" r="4" fill="#e9eef2"/>
    <!-- cheeks -->
    <ellipse id="cheekL" cx="33" cy="60" rx="4.6" ry="3" fill="#e0776a" opacity=".5"/><ellipse id="cheekR" cx="67" cy="60" rx="4.6" ry="3" fill="#e0776a" opacity=".5"/>
    <!-- eyes -->
    <g id="eyeL"><ellipse cx="40" cy="50" rx="5.6" ry="6.2" fill="#fffaf0"/><circle id="pupL" cx="40.6" cy="50.6" r="3.2" fill="#2a2a32"/><circle cx="41.8" cy="49.2" r="1.1" fill="#fff"/></g>
    <g id="eyeR"><ellipse cx="60" cy="50" rx="5.6" ry="6.2" fill="#fffaf0"/><circle id="pupR" cx="59.4" cy="50.6" r="3.2" fill="#2a2a32"/><circle cx="60.6" cy="49.2" r="1.1" fill="#fff"/></g>
    <g clip-path="url(#clipL)"><rect id="lidL" x="33" y="43.2" width="14" height="0" fill="#b87650"/></g>
    <g clip-path="url(#clipR)"><rect id="lidR" x="53" y="43.2" width="14" height="0" fill="#b87650"/></g>
    <line id="browL" x1="33" y1="41.5" x2="46" y2="41.5" stroke="#1f1f26" stroke-width="2.6" stroke-linecap="round"/>
    <line id="browR" x1="54" y1="41.5" x2="67" y2="41.5" stroke="#1f1f26" stroke-width="2.6" stroke-linecap="round"/>
    <!-- nose + stubble hint -->
    <path d="M50 52 q-2.2 5 1 6.4" stroke="#8b5538" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M35 66 Q50 76 65 66" stroke="#1f1f26" stroke-opacity=".18" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path id="mouthFill" d="" fill="#6a2c30" opacity="0"/>
    <path id="mouth" d="M41 64 Q50 72 59 64" fill="none" stroke="#3a1f1c" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path id="sweat" d="M72 36 q4 6 0 8.4 q-4 -2.4 0 -8.4z" fill="#9fd6ea" opacity="0"/>
    <g id="steam" opacity="0"><circle cx="24" cy="24" r="2.6" fill="#fff" opacity=".8"/><circle cx="19" cy="17" r="1.8" fill="#fff" opacity=".6"/><circle cx="78" cy="22" r="2.6" fill="#fff" opacity=".8"/></g>
  </g>
</svg>`;
