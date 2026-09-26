<template>
  <span class="pe-sicon" v-html="svgHtml"></span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: { type: String, default: '' },
  size: { type: [Number, String], default: 20 },
  color: { type: String, default: 'currentColor' },
});

// 与 web-app SIcon 同一套图标（复制自 SIcon.vue svgMap，管理端画布预览用）
const svgMap = {
  like: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  comment: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  team: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5"/><path d="M15 15c2.5 0 5 1.5 5 4"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 21v-3h4v3"/>',
  market: '<circle cx="8.5" cy="8.5" r="3.4"/><circle cx="15.8" cy="9.2" r="2.8"/><path d="M3 19.5c.4-3.2 2.8-5 5.2-5s4.8 1.8 5.2 5"/><path d="M14.4 14.8c2.7.4 4.8 2 5.2 4.7"/>',
  exchange: '<path d="M8 6.5h8l-2.5-2.5"/><path d="M16 17.5H8l2.5 2.5"/><rect x="2" y="8" width="8" height="5.5" rx="1.5"/><rect x="14" y="10.5" width="8" height="5.5" rx="1.5"/>',
  pool: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  radar: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><path d="M12 12l6.7-6.7"/>',
  customer: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9.5" r="2.4"/><path d="M6 16.5c.5-2 1.9-3 3-3s2.5 1 3 3"/><path d="M15 8.5h3.5M15 12h3.5M15 15.5h2.5"/>',
  audit: '<path d="M9 11l2 2 4-4"/><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v4M16 3v4"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M17 12v3M20 12v2"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  template: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="7" y="8" width="4" height="4" rx="1"/><path d="M13 9h6M13 13h6M7 16h10"/>',
  dynamic: '<path d="M21 11.5c0 4.3-4 7.8-9 7.8-1.2 0-2.4-.2-3.4-.6L4 21l1.6-3.4C4.2 16.2 3 14.3 3 11.5 3 7.2 7 3.7 12 3.7s9 3.5 9 7.8z"/><circle cx="8.2" cy="11.5" r="0.9" fill="currentColor"/><circle cx="12" cy="11.5" r="0.9" fill="currentColor"/><circle cx="15.8" cy="11.5" r="0.9" fill="currentColor"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  apps: '<circle cx="6" cy="6" r="1.8" fill="currentColor"/><circle cx="12" cy="6" r="1.8" fill="currentColor"/><circle cx="18" cy="6" r="1.8" fill="currentColor"/><circle cx="6" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18" cy="12" r="1.8" fill="currentColor"/><circle cx="6" cy="18" r="1.8" fill="currentColor"/><circle cx="12" cy="18" r="1.8" fill="currentColor"/><circle cx="18" cy="18" r="1.8" fill="currentColor"/>',
  orders: '<path d="M6 2h12l2 4v15a1 1 0 01-1 1H5a1 1 0 01-1-1V6l2-4z"/><path d="M6 6h12"/><path d="M9 12h6M9 16h4"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="17" cy="15" r="1.5" fill="currentColor"/>',
  storage: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><circle cx="12" cy="5" r="1" fill="currentColor"/>',
  sms: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M7 9h10M7 13h6"/><path d="M8 18l-2 3v-3"/>',
  dist: '<circle cx="12" cy="12" r="2.8"/><circle cx="4.5" cy="5.5" r="2.2"/><circle cx="19.5" cy="5.5" r="2.2"/><circle cx="4.5" cy="18.5" r="2.2"/><circle cx="19.5" cy="18.5" r="2.2"/><path d="M10.4 10.4L6 6M13.6 10.4l4.4-4.4M10.4 13.6l-4.4 4.4M13.6 13.6l4.4 4.4"/>',
  partner: '<circle cx="8" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><path d="M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M14 19c0-1.8 1-3.4 2.4-4.3"/><path d="M19.5 15.5l1 2 2 .3"/>',
  share: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><path d="M12 9.2L6.8 7"/><path d="M12 9.2l5.2-2.2"/><path d="M12 14.8l-6 2"/><path d="M12 14.8l5.4-1"/>',
  category: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  area: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  panorama: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  card: '<rect x="1.5" y="4" width="21" height="16" rx="3"/><circle cx="7" cy="10.5" r="2"/><path d="M5 16.5c.5-1.6 1.3-2.3 2-2.3s1.5.7 2 2.3"/><path d="M13 8.5h7M13 12h7M13 15.5h5"/>',
  channel: '<circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M6.5 6.5l3 3M17.5 6.5l-3 3M6.5 17.5l3-3M17.5 17.5l-3-3"/>',
  solutions: '<path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 14.5 7.1 17.2l.9-5.5-4-3.9L9.5 7z"/>',
  users: '<circle cx="12" cy="7" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M2 12c.5-2 2-3.5 4-3.5"/><path d="M22 12c-.5-2-2-3.5-4-3.5"/>',
  logs: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/><path d="M8 3v2M16 3v2"/>',
  crown: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  'no-ads': '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  badge: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 21l5-3 5 3-1.5-7.5"/>',
  voucher: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M3 10.5h18"/><circle cx="12" cy="10.5" r="1.7"/>',
  analytics: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
  palette: '<path d="M12 2a10 10 0 000 20c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 004-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>',
  delivery: '<rect x="2" y="7" width="11" height="10" rx="2"/><path d="M13 9.5h3.2c.3 0 .6.1.8.3l2.5 2.4c.2.2.3.5.3.8V16h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  verify: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.8 2.8 5.2-6"/>',
  show: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
  devices: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M2 17h10"/><rect x="16" y="9" width="6" height="11" rx="1.5"/><path d="M18 18h2"/>',
  wechat: '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/><circle cx="9" cy="10" r="0.5" fill="currentColor"/><circle cx="14" cy="10" r="0.5" fill="currentColor"/>',
  alipay: '<circle cx="12" cy="12" r="8.5"/><path d="M8 9.2h8M12 9.2v4.2M8.6 14.3c1.9 2.2 4.9 2.2 6.8 0"/>',
  mobile: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 18h4"/><path d="M9 6h6"/>',
  official: '<path d="M3 11v2a1 1 0 001 1h3l5 4V6L7 10H4a1 1 0 00-1 1z"/><path d="M16 8a5 5 0 010 8"/><path d="M19 5a9 9 0 010 14"/>',
  pc: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  location: '<path d="M12 21c5-5 8-8.5 8-12a8 8 0 1 0-16 0c0 3.5 3 7 8 12z"/><circle cx="12" cy="9" r="3"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
  star: '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.2l5.9-.8z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
};

const svgHtml = computed(() => {
  const content = svgMap[props.name];
  if (!content) return '';
  const n = Number(props.size) || 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="${props.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
});
</script>

<style scoped>
.pe-sicon {
  display: inline-flex;
  flex-shrink: 0;
  line-height: 0;
}
</style>
