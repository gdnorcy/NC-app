// 用 @vue/compiler-sfc 直接解析/编译单个 SFC，验证模板+脚本语法（绕开 uni build 的 dist 清理）
const fs = require('fs');
const path = require('path');
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');

const file = process.argv[2];
const filename = path.basename(file);
const src = fs.readFileSync(file, 'utf8');

const { descriptor, errors: parseErrors } = parse(src, { filename });
if (parseErrors.length) {
  console.error('PARSE ERRORS:');
  parseErrors.forEach((e) => console.error('  ', e.message || e));
  process.exit(1);
}
console.log('parse: OK');

try {
  compileScript(descriptor, { id: 'sfc' });
  console.log('script setup: OK');
} catch (e) {
  console.error('SCRIPT ERROR:', e.message);
  process.exit(1);
}

if (descriptor.template) {
  const t = compileTemplate({
    source: descriptor.template.content,
    filename,
    id: 'sfc',
  });
  if (t.errors && t.errors.length) {
    console.error('TEMPLATE ERRORS:');
    t.errors.forEach((e) => console.error('  ', typeof e === 'string' ? e : e.message));
    process.exit(1);
  }
  console.log('template: OK');
}
console.log('ALL OK for', filename);
