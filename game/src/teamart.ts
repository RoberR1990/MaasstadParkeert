// Flat team avatars in the Ria/Sap style: generic, diverse characters (not real people), one per team.
import type { TeamId } from '@sim/types';

interface Look { bg: [string, string]; skin: string; skin2: string; outfit: string; trim: string }
const LOOK: Record<TeamId, Look> = {
  handhaving: { bg: ['#cfe0f1', '#a9c3de'], skin: '#b57a55', skin2: '#9a6444', outfit: '#2f4a6e', trim: '#f2c53d' },
  backoffice: { bg: ['#e4dcf3', '#c7bbe3'], skin: '#f1c9a5', skin2: '#dcae88', outfit: '#6d7f94', trim: '#f4ecdc' },
  techniek: { bg: ['#fbe5b8', '#f3c97a'], skin: '#d9a37c', skin2: '#bf8960', outfit: '#e9803c', trim: '#f6e7c4' },
  schoonmaak: { bg: ['#d4ecdc', '#aed6bd'], skin: '#e3b48f', skin2: '#c89a76', outfit: '#2f8f84', trim: '#f2c53d' },
  klantcontact: { bg: ['#f7d3dc', '#eeb0c0'], skin: '#8a5a3c', skin2: '#734a31', outfit: '#7a4aa0', trim: '#f4ecdc' },
};
const eyes = (g = '#2a2a32') => `<ellipse cx="50" cy="60" rx="3" ry="3.2" fill="#fffaf0"/><ellipse cx="70" cy="60" rx="3" ry="3.2" fill="#fffaf0"/><circle cx="50.5" cy="60.4" r="1.9" fill="${g}"/><circle cx="70.5" cy="60.4" r="1.9" fill="${g}"/>`;
const smile = (c = '#8a4b45') => `<path class="mouth" d="M52 72 Q60 79 68 72" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/><path class="mouth-sad" d="M52 76 Q60 70 68 76" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`;
const brows = (c: string) => `<path d="M44 53 q5 -3 10 -1 M66 52 q5 -2 10 1" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
const cheeks = `<ellipse cx="43" cy="69" rx="4.5" ry="3" fill="#ee9a8a" opacity=".45"/><ellipse cx="77" cy="69" rx="4.5" ry="3" fill="#ee9a8a" opacity=".45"/>`;
const sweat = `<path class="sweat" d="M86 40 q5 8 0 11 q-5 -3 0 -11z" fill="#9fd6ea"/>`;

const BODY: Record<TeamId, (l: Look) => { back: string; front: string }> = {
  // Fatima: headscarf, navy uniform with reflective stripe
  handhaving: (l) => ({
    back: `<path d="M26 66 C22 38 38 22 60 22 C82 22 98 38 94 66 C94 84 86 96 78 100 L42 100 C34 96 26 84 26 66z" fill="#34527a"/>`,
    front: `<path d="M38 52 C38 40 48 34 60 34 C72 34 82 40 82 52 C76 46 68 44 60 44 C52 44 44 46 38 52z" fill="#34527a"/><path d="M40 82 C46 92 74 92 80 82" fill="none" stroke="#34527a" stroke-width="5"/>
      ${eyes()}${brows('#2b2230')}${smile('#7d3f3a')}${cheeks}
      <rect x="28" y="108" width="64" height="5" fill="${l.trim}" opacity=".9"/><circle cx="82" cy="100" r="3.4" fill="${l.trim}"/>`,
  }),
  // Daan: short brown hair, glasses, lanyard
  backoffice: (l) => ({
    back: ``,
    front: `<path d="M37 52 C35 32 48 24 62 24 C77 24 86 34 83 52 C79 42 72 38 60 38 C50 38 42 42 37 52z" fill="#6b4a34"/>
      ${eyes()}${brows('#5b3d2a')}${smile()}${cheeks}
      <g fill="none" stroke="#3b4a58" stroke-width="2"><rect x="42" y="55" width="16" height="12" rx="5"/><rect x="62" y="55" width="16" height="12" rx="5"/><path d="M58 60.5 h4"/></g>
      <path d="M52 90 L60 112 L68 90" fill="none" stroke="#3b78c2" stroke-width="2.4"/><rect x="55" y="104" width="10" height="13" rx="2" fill="#fff" stroke="#3b78c2" stroke-width="1.6"/>`,
  }),
  // Kevin: yellow hard hat, stubble, orange overall
  techniek: (l) => ({
    back: ``,
    front: `<path d="M34 50 C34 30 46 20 60 20 C74 20 86 30 86 50z" fill="#f2c53d"/><rect x="30" y="47" width="60" height="8" rx="4" fill="#e3ad1f"/><rect x="54" y="14" width="12" height="9" rx="3" fill="#f2c53d"/>
      ${eyes()}${brows('#4b3626')}${smile()}${cheeks}
      <path d="M44 72 Q60 90 76 72" fill="#6b4a34" opacity=".2"/>
      <path d="M44 90 L60 106 L76 90" fill="${l.trim}" opacity=".95"/><path d="M60 106 V124" stroke="#c4602a" stroke-width="2"/><rect x="30" y="108" width="60" height="5" fill="${l.trim}" opacity=".9"/>`,
  }),
  // Mehmet: dark curly hair, teal polo with hi-vis vest
  schoonmaak: (l) => ({
    back: `<path d="M32 58 C28 34 44 22 60 22 C76 22 92 34 88 58 C88 64 86 68 84 70 L36 70 C34 68 32 64 32 58z" fill="#2b2230"/>`,
    front: `<path d="M36 50 C36 36 46 30 60 30 C74 30 84 36 84 50 C80 42 72 38 60 38 C48 38 40 42 36 50z" fill="#2b2230"/><circle cx="42" cy="36" r="5" fill="#2b2230"/><circle cx="54" cy="29" r="5.5" fill="#2b2230"/><circle cx="68" cy="29" r="5.5" fill="#2b2230"/><circle cx="79" cy="36" r="5" fill="#2b2230"/>
      ${eyes()}${brows('#2b2230')}${smile()}${cheeks}
      <path d="M30 124 C32 100 44 92 52 90 L60 106 L68 90 C76 92 88 100 90 124z" fill="${l.trim}"/><path d="M52 90 L60 106 L68 90" fill="none" stroke="#e9a91f" stroke-width="2"/><rect x="36" y="108" width="48" height="4" fill="#fff" opacity=".8"/>`,
  }),
  // Priya: long black hair, headset, purple blouse
  klantcontact: (l) => ({
    back: `<path d="M28 62 C24 36 40 22 60 22 C80 22 96 36 92 62 C94 82 90 100 84 108 L36 108 C30 100 26 82 28 62z" fill="#231a26"/>`,
    front: `<path d="M36 52 C36 34 48 27 60 27 C72 27 84 34 84 52 C78 42 70 38 60 38 C50 38 42 42 36 52z" fill="#231a26"/>
      ${eyes()}${brows('#231a26')}${smile('#8a3a46')}${cheeks}
      <path d="M34 62 C32 40 46 28 60 28 C74 28 88 40 86 62" fill="none" stroke="#3b4a58" stroke-width="3.4" stroke-linecap="round"/><rect x="30" y="58" width="7" height="13" rx="3.4" fill="#3b4a58"/><path d="M33 70 C34 80 44 82 52 79" fill="none" stroke="#3b4a58" stroke-width="2.4" stroke-linecap="round"/><circle cx="53" cy="79" r="2.6" fill="#e2735a"/>
      <path d="M46 92 L60 108 L74 92" fill="${l.trim}" opacity=".9"/>`,
  }),
};

/** SVG markup of a team character. The element gets class `sweat-on` from the stylesheet when the team is overloaded. */
export function teamAvatar(id: TeamId): string {
  const l = LOOK[id], b = BODY[id](l);
  return `<svg class="tav" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><clipPath id="tav-${id}"><circle cx="60" cy="60" r="56"/></clipPath><linearGradient id="tavbg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l.bg[0]}"/><stop offset="1" stop-color="${l.bg[1]}"/></linearGradient></defs>
  <circle cx="60" cy="60" r="58" fill="#fff6e4"/><circle cx="60" cy="60" r="55" fill="url(#tavbg-${id})"/>
  <g clip-path="url(#tav-${id})">
    ${b.back}
    <path d="M12 124 C14 98 32 88 60 88 C88 88 106 98 108 124z" fill="${l.outfit}"/>
    <rect x="52" y="78" width="16" height="14" rx="6" fill="${l.skin2}"/>
    <ellipse cx="60" cy="58" rx="23" ry="26" fill="${l.skin}"/>
    ${b.front}
    ${sweat}
  </g>
  <circle cx="60" cy="60" r="55" fill="none" stroke="#fff6e4" stroke-width="4"/>
</svg>`;
}
