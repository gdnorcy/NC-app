// 车牌号软键盘：字符集与键位布局
// 对标站 car-number-widget：点省份格弹「省份键盘」→ 选完自动切「字母数字键盘」。
// 真实车牌规则：第 1 格=省份简称；第 2 格=发牌机关代号（仅字母）；
// 第 3 格起=序号（字母+数字）。字母排除 I/O（避免与 1/0 混淆）。

// 省份简称（31 省市区 + 使 / 领）
export const PLATE_PROVINCES = [
  '京', '津', '冀', '晋', '蒙', '辽', '吉', '黑', '沪', '苏', '浙', '皖', '闽', '赣', '鲁', '豫',
  '鄂', '湘', '粤', '桂', '琼', '渝', '川', '贵', '云', '藏', '陕', '甘', '青', '宁', '新', '使', '领',
];

// 字母（去 I / O）
export const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');

// 数字
export const PLATE_DIGITS = '0123456789'.split('');

// 按格索引返回该格的键盘类型
//  index === 0 → province（省份键盘）
//  index === 1 → letter（发牌机关，仅字母）
//  index >= 2  → alnum（序号，字母+数字）
export function plateKeyType(index) {
  if (index === 0) return 'province';
  if (index === 1) return 'letter';
  return 'alnum';
}

// 省份键盘：每行 9 个
export function provinceRows() {
  const rows = [];
  for (let i = 0; i < PLATE_PROVINCES.length; i += 9) {
    rows.push(PLATE_PROVINCES.slice(i, i + 9));
  }
  return rows;
}

// 字母键盘：每行 8 个
export function letterRows() {
  const rows = [];
  for (let i = 0; i < PLATE_LETTERS.length; i += 8) {
    rows.push(PLATE_LETTERS.slice(i, i + 8));
  }
  return rows;
}

// 字母数字键盘用到的全部键位布局（字母行 + 数字行）
export function alphaKeyboard() {
  return { letterRows: letterRows(), digitRow: PLATE_DIGITS.slice() };
}
