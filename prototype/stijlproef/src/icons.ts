// One consistent inline-SVG icon family: 24px grid, 1.9 stroke, round caps, soft tinted fills.
const wrap = (body: string, cls = '') =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const T = 'fill="currentColor" fill-opacity=".16"';

const ICONS: Record<string, string> = {
  garage: `<path d="M3.5 20.5v-12L12 3.5l8.5 5v12z" ${T}/><path d="M10 17.5v-7.8h2.6a2.2 2.2 0 0 1 0 4.4H10"/>`,
  automaat: `<rect x="6.5" y="2.8" width="11" height="11.2" rx="4" ${T}/><path d="M10 7.2h4M12 14v6.7M8.5 20.7h7"/><circle cx="12" cy="10.6" r="1.1" fill="currentColor"/>`,
  fiets: `<circle cx="6" cy="16.2" r="3.7" ${T}/><circle cx="18" cy="16.2" r="3.7" ${T}/><path d="M6 16.2l3.6-7h5.1l3.3 7M10.5 16.2l4.2-7M8.6 8.5h2.6M14.7 9.2l-.9-1.9h2"/>`,
  coin: `<circle cx="12" cy="12" r="8.6" ${T}/><path d="M14.9 9.3a3.5 3.5 0 1 0 0 5.4M8.6 11h5M8.6 13.1h4.4"/>`,
  calendar: `<rect x="3.8" y="5.2" width="16.4" height="15" rx="3.5" ${T}/><path d="M3.8 10h16.4M8.2 3.4v3.6M15.8 3.4v3.6"/>`,
  sun: `<circle cx="12" cy="12" r="4.2" ${T}/><path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M18.5 5.5L17 7M7 17l-1.5 1.5"/>`,
  moon: `<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" ${T}/>`,
  rain: `<path d="M7 15.5a4.3 4.3 0 0 1-.4-8.6A5.5 5.5 0 0 1 17.2 8a3.8 3.8 0 0 1-.2 7.5z" ${T}/><path d="M8.5 18.2l-.9 2M12.5 18.2l-.9 2M16.5 18.2l-.9 2"/>`,
  volume: `<path d="M4 9.8v4.4h3.4l4.6 3.6V6.2L7.4 9.8z" ${T}/><path d="M15.4 9.2a4 4 0 0 1 0 5.6M17.8 6.9a7.3 7.3 0 0 1 0 10.2"/>`,
  mute: `<path d="M4 9.8v4.4h3.4l4.6 3.6V6.2L7.4 9.8z" ${T}/><path d="M16 9.6l4.4 4.8M20.4 9.6L16 14.4"/>`,
  pause: `<rect x="6.2" y="5" width="3.8" height="14" rx="1.4" ${T}/><rect x="14" y="5" width="3.8" height="14" rx="1.4" ${T}/>`,
  play: `<path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7z" ${T}/>`,
  close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  home: `<path d="M4.2 11.2L12 4.6l7.8 6.6V19a1 1 0 0 1-1 1H5.2a1 1 0 0 1-1-1z" ${T}/><path d="M10 20v-5.2h4V20"/>`,
  shop: `<path d="M4 9.4l1.4-4.6h13.2L20 9.4a2.6 2.6 0 0 1-4 1.5 2.6 2.6 0 0 1-4 0 2.6 2.6 0 0 1-4 0A2.6 2.6 0 0 1 4 9.4z" ${T}/><path d="M5.6 12v7.4h12.8V12M10 19.4v-4h4v4"/>`,
  pin: `<path d="M12 21s6.6-5.6 6.6-11.2a6.6 6.6 0 0 0-13.2 0C5.4 15.4 12 21 12 21z" ${T}/><circle cx="12" cy="9.8" r="2.3"/>`,
  city: `<path d="M3.8 20.2v-8.4h5v8.4M8.8 20.2V4.6h6.4v15.6M15.2 20.2v-10h5v10" ${T}/><path d="M11.2 8.4h1.6M11.2 11.6h1.6M11.2 14.8h1.6M2.8 20.2h18.4"/>`,
  hall: `<path d="M3.5 9.4L12 4l8.5 5.4z" ${T}/><path d="M6.2 11.6v6.2M10.1 11.6v6.2M13.9 11.6v6.2M17.8 11.6v6.2M4 20h16"/>`,
  car: `<path d="M3.6 15.6v-3.2l1.9-4.6a1.6 1.6 0 0 1 1.5-1h10a1.6 1.6 0 0 1 1.5 1l1.9 4.6v3.2a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1z" ${T}/><circle cx="7.6" cy="15.8" r="1.5" fill="currentColor"/><circle cx="16.4" cy="15.8" r="1.5" fill="currentColor"/><path d="M5.6 12.2h12.8"/>`,
  search: `<circle cx="10.5" cy="10.5" r="6" ${T}/><path d="M15 15l5 5"/>`,
  clock: `<circle cx="12" cy="12" r="8.4" ${T}/><path d="M12 7.2V12l3.2 2"/>`,
  chevron: `<path d="M9 5.5l6.5 6.5L9 18.5"/>`,
  sparkle: `<path d="M12 3.5l1.7 5.1 5.1 1.7-5.1 1.7L12 17l-1.7-5-5.1-1.7 5.1-1.7z" ${T}/>`,
  target: `<circle cx="12" cy="12" r="8.4" ${T}/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1" fill="currentColor"/>`,
  flag: `<path d="M5.5 21V4.2"/><path d="M5.5 5.2c3.4-2 5.6 1.8 9 0 1.6-.8 3-.8 4.2-.3v8c-1.2-.5-2.6-.5-4.2.3-3.4 1.8-5.6-2-9 0z" ${T}/>`,
  tag: `<path d="M3.6 12.2V4.6a1 1 0 0 1 1-1h7.6l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0z" ${T}/><circle cx="8.4" cy="8.4" r="1.4" fill="currentColor"/>`,
  sliders: `<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.1" ${T}/><circle cx="9" cy="17" r="2.1" ${T}/>`,
  chat: `<path d="M4.2 6.6a2.4 2.4 0 0 1 2.4-2.4h10.8a2.4 2.4 0 0 1 2.4 2.4v7.2a2.4 2.4 0 0 1-2.4 2.4H11l-4.2 3.6v-3.6a2.4 2.4 0 0 1-2.6-2.4z" ${T}/>`,
  rotate: `<path d="M19.6 12a7.6 7.6 0 1 1-2.5-5.6"/><path d="M19.8 4.6v4.4h-4.4"/>`,
};

export const icon = (name: string, cls = '') => wrap(ICONS[name] ?? '', cls);
