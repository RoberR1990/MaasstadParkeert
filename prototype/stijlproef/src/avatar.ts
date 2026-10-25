// "Ria van Beheer" – simple illustrated avatar in SVG (generic, not a real person).
export const RIA_SVG = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="riaClip"><circle cx="60" cy="60" r="56"/></clipPath>
    <linearGradient id="riaBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0e6"/><stop offset="1" stop-color="#8fc3cc"/></linearGradient>
  </defs>
  <circle cx="60" cy="60" r="58" fill="#fff6e4"/>
  <circle cx="60" cy="60" r="55" fill="url(#riaBg)"/>
  <g clip-path="url(#riaClip)">
    <!-- soft skyline -->
    <path d="M0 78 V62 h12 v-10 h10 v14 h8 v-20 h12 v26 h10 v-12 h10 v18z" fill="#fff" opacity=".28"/>
    <!-- body: hi-vis jacket -->
    <path d="M14 124 C16 96 34 88 60 88 C86 88 104 96 106 124z" fill="#e98a52"/>
    <path d="M44 90 L60 108 L76 90 C70 87 66 86 60 86 C54 86 50 87 44 90z" fill="#f6ead2"/>
    <rect x="26" y="106" width="68" height="6" fill="#f6ead2" opacity=".9"/>
    <path d="M60 108 V124" stroke="#c9703c" stroke-width="2"/>
    <!-- lanyard -->
    <path d="M50 88 L60 106 L70 88" fill="none" stroke="#2f6f7e" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="55.5" y="106" width="9" height="11" rx="2" fill="#fff" stroke="#2f6f7e" stroke-width="1.6"/>
    <!-- neck -->
    <rect x="52" y="78" width="16" height="14" rx="6" fill="#e6b08e"/>
    <!-- hair back -->
    <path d="M27 58 C24 36 38 24 60 24 C82 24 96 36 93 58 C92 72 88 80 84 84 L36 84 C32 80 28 72 27 58z" fill="#8c7a6e"/>
    <!-- face -->
    <ellipse cx="60" cy="57" rx="23" ry="26" fill="#f4c9a6"/>
    <!-- hard hat -->
    <path d="M32 46 C32 26 46 17 60 17 C74 17 88 26 88 46 Z" fill="#f2bb45"/>
    <rect x="28" y="43" width="64" height="8" rx="4" fill="#e3a62d"/>
    <rect x="55" y="12" width="10" height="9" rx="3" fill="#f2bb45"/>
    <circle cx="60" cy="32" r="8" fill="#2f6f7e"/>
    <text x="60" y="37.2" text-anchor="middle" font-family="Fredoka Variable, system-ui, sans-serif" font-weight="700" font-size="12" fill="#fff6e4">P</text>
    <!-- hair tufts -->
    <path d="M33 52 C31 62 32 72 36 78 C34 70 36 60 38 52z" fill="#8c7a6e"/>
    <path d="M87 52 C89 62 88 72 84 78 C86 70 84 60 82 52z" fill="#8c7a6e"/>
    <!-- glasses -->
    <g fill="none" stroke="#3b4a58" stroke-width="2.2">
      <rect x="40" y="55" width="16" height="12" rx="5"/><rect x="64" y="55" width="16" height="12" rx="5"/><path d="M56 60.5 h8"/>
    </g>
    <circle cx="48" cy="61" r="2.2" fill="#3b4a58"/><circle cx="72" cy="61" r="2.2" fill="#3b4a58"/>
    <path d="M43 52 q5 -3 10 -1 M67 51 q5 -2 10 1" stroke="#6b5a4e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <ellipse cx="42" cy="71" rx="4.5" ry="3" fill="#ee9a8a" opacity=".55"/><ellipse cx="78" cy="71" rx="4.5" ry="3" fill="#ee9a8a" opacity=".55"/>
    <path d="M52 74 Q60 82 68 74" fill="#fff" stroke="#8a4b45" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <circle cx="60" cy="60" r="55" fill="none" stroke="#fff6e4" stroke-width="4"/>
</svg>`;
