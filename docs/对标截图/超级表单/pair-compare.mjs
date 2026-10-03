#!/usr/bin/env node
// ============================================================================
// pair-compare.mjs —— 把「ew 截图」与「我方截图」拼成并排对照 HTML
// 用途：人工逐眼核对视觉差异（机器只做逻辑 diff，视觉靠人眼 + 本工具并排呈现）
//
// 用法:
//   node pair-compare.mjs
//   或自定义目录:
//   EW_DIR=./ew面板 MINE_DIR=./我方面板 OUT=./compare.html node pair-compare.mjs
//
// 约定：
//   - ew / mine 两个目录里，截图文件名 = 组件 type（title.png / swiper.png …）
//   - 你提供的 ew 截图请按组件 type 命名后放进 EW_DIR
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);
const EW_DIR = path.resolve(root, process.env.EW_DIR || 'ew面板');
const MINE_DIR = path.resolve(root, process.env.MINE_DIR || '我方面板');
const OUT = path.resolve(root, process.env.OUT || 'compare.html');

// 组件顺序 + 中文名（与 SuperForm/components.js COMPONENT_LABEL 一致）
const ORDER = ['text','textarea','image','radio','checkbox','select','date','number','time','location','attachment','sms','agreement','rate','filedownload','phoneauth','carplate','submit','pagebreak','backdesc','realtime','pay','swiper','bigimage','title','richtext','blank','line','video'];
const LABEL = {
  text:'单行文本', textarea:'多行文本', image:'图片上传', radio:'单项选择', checkbox:'多项选择',
  select:'下拉选择', date:'日期', number:'数字', time:'时间', location:'定位', attachment:'附件',
  sms:'短信认证', agreement:'协议', rate:'评分', filedownload:'文件下载', phoneauth:'手机号授权',
  carplate:'车牌号', submit:'提交按钮', pagebreak:'分页', backdesc:'后台描述', realtime:'实时动态',
  pay:'表单支付', swiper:'轮播图', bigimage:'大图模块', title:'标题', richtext:'富文本',
  blank:'空白块', line:'辅助线', video:'视频',
};

// 每个组件「逐眼核对清单」——来自复刻完整度-diff报告 B 类缺口（已在我方落地，需视觉确认对齐）
const CHECK = {
  text:['是否显示/是否必填（顶栏）','内容标题/提示/预填/输入类型','同步手机号/姓名'],
  textarea:['是否显示/是否必填','多行输入','最少/最多输入'],
  image:['是否显示/是否必填','图片类型(普通/身份证/营业执照)','示例图引导','最少/最多上传'],
  radio:['是否显示/是否必填','选项编辑','是否必填独立开关'],
  checkbox:['是否显示/是否必填','排他选项','添加其他选项','批量添加'],
  select:['是否显示/是否必填','预设类型(普通/省市区/日期)','下拉框级数'],
  date:['是否显示/是否必填','日期类型','同步生日/默认范围'],
  number:['是否显示/是否必填','步进/默认值','范围限制'],
  time:['是否显示/是否必填','时间类型(时间段/单个时间)'],
  location:['是否显示/是否必填','内容类型(定位点/路线)'],
  attachment:['是否显示/是否必填','上传类型白名单','大小限制(KB)'],
  sms:['是否显示/是否必填','按钮文案/说明'],
  agreement:['是否显示/是否必填','勾选文案','协议正文','显示方式(直接/看完勾选)','链接文案/地址'],
  rate:['是否显示/是否必填','描述/最高量级/半选'],
  filedownload:['是否显示/是否必填','文件名称/地址','示例文件','提示文字'],
  phoneauth:['是否显示/是否必填','按钮文案'],
  carplate:['是否显示/是否必填','提示文字'],
  submit:['是否显示/是否必填','按钮文案','上下文提示(场景)','跳转指定页面'],
  pagebreak:['是否显示/是否必填','禁止返回上一步','上一步/下一步文案'],
  backdesc:['是否显示/是否必填','描述文字'],
  realtime:['是否显示/是否必填','模块标题/动态文案','虚拟人数','倒计时'],
  pay:['是否显示/是否必填','规格类型(单/多)','固定金额/规格','库存展示','退款/核销/限购','日期选择','优惠券/积分/会员折扣/分销标签'],
  swiper:['是否显示/是否必填','图片列表','图片描述','点击链接','高度'],
  bigimage:['是否显示/是否必填','图片地址','图片描述','跳转链接'],
  title:['是否显示/是否必填','主标题/副标题/提示/链接','大小/对齐/颜色'],
  richtext:['是否显示/是否必填','富文本编辑'],
  blank:['是否显示/是否必填','空白高度'],
  line:['是否显示/是否必填','线条样式/颜色','线条高度'],
  video:['是否显示/是否必填','视频地址/封面','显示方式(直接/弹出)','自动播放'],
};

function imgCell(dir, type) {
  const p = path.join(dir, `${type}.png`);
  if (fs.existsSync(p)) {
    const rel = path.relative(root, p).split(path.sep).join('/');
    return `<img src="${rel}" loading="lazy" alt="${type}"/>`;
  }
  return `<div class="missing">缺 ${type}.png</div>`;
}

const rows = ORDER.map((t, i) => {
  const checks = (CHECK[t] || []).map(c => `<li>${c}</li>`).join('');
  return `<tr>
    <td class="idx">${i+1}</td>
    <td class="name">${LABEL[t]}<br/><small>${t}</small></td>
    <td class="shot">${imgCell(EW_DIR, t)}</td>
    <td class="shot">${imgCell(MINE_DIR, t)}</td>
    <td class="chk"><ul>${checks}</ul></td>
  </tr>`;
}).join('\n');

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>超级表单 · 我方 vs ew 面板并排对照</title>
<style>
  body{font-family:-apple-system,'PingFang SC',Arial,sans-serif;margin:0;background:#f5f6f8;color:#1d2129}
  h1{font-size:18px;padding:16px 20px;margin:0;background:#1d2129;color:#fff}
  .meta{padding:8px 20px;color:#86909c;font-size:13px}
  table{border-collapse:collapse;width:100%;background:#fff}
  th,td{border:1px solid #e5e6eb;padding:8px;vertical-align:top}
  th{background:#f2f3f5;font-size:13px;text-align:left}
  .idx{width:36px;text-align:center;color:#86909c}
  .name{width:90px;font-weight:600}
  .name small{color:#c9cdd4;font-weight:400}
  .shot{width:38%}
  .shot img{max-width:100%;border:1px solid #eee;border-radius:4px}
  .missing{color:#f53f3f;font-size:13px;padding:20px 0;text-align:center}
  .chk{width:24%}
  .chk ul{margin:0;padding-left:16px;font-size:12px;color:#4e5969;line-height:1.7}
  tr:nth-child(even) td{background:#fafbfc}
</style></head><body>
<h1>超级表单 · 我方 vs ew 面板并排对照</h1>
<div class="meta">ew 目录：${path.relative(root, EW_DIR)} ｜ 我方目录：${path.relative(root, MINE_DIR)} ｜ 生成于 ${new Date().toLocaleString('zh-CN')}</div>
<table>
  <thead><tr><th>#</th><th>组件</th><th>ew 截图</th><th>我方截图</th><th>逐眼核对清单（B 类缺口，已落地待确认）</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</body></html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`已生成 ${OUT}（${ORDER.length} 行）`);
console.log(`  ew 目录: ${EW_DIR}  ${fs.existsSync(EW_DIR)?'':'(不存在)'}`);
console.log(`  我方目录: ${MINE_DIR}  ${fs.existsSync(MINE_DIR)?'':'(不存在)'}`);
