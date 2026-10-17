import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 自运营模式代码上传：miniprogram-ci 通道
 *
 * 与第三方平台「模板代上传」的本质差异：
 * - 代上传：平台持有代码模板，通过 component API 推送到已授权租户小程序（无需租户密钥）。
 * - 自运营：租户未授权第三方平台，只能用「小程序代码上传密钥」走 miniprogram-ci，
 *   从本机工程目录编译上传 —— 因此服务器必须同时具备：
 *   ① miniprogram-ci 依赖（server 工作区 npm install）
 *   ② 构建好的小程序工程目录（env.MP_CI_PROJECT_DIR，含 project.config.json 的
 *      web-app/dist/build/mp-weixin 产物；appid 由 ci.Project 参数按租户注入，无需改文件）
 *
 * 环境变量：
 * - MP_CI_PROJECT_DIR  小程序工程目录绝对路径（必填）
 * - MP_CI_ROBOT        ci robot 编号，默认 1
 */
export async function ciUploadMini({ appid, uploadKey, version, desc, robot = 1 }) {
  if (!appid) throw new Error('缺少小程序 AppID（请在参数设置中填写）');
  if (!uploadKey) throw new Error('缺少代码上传密钥（请在参数设置中填写）');

  const projectDir = process.env.MP_CI_PROJECT_DIR || '';
  if (!projectDir || !fs.existsSync(path.join(projectDir, 'project.config.json'))) {
    throw new Error('服务器未配置小程序工程目录（env.MP_CI_PROJECT_DIR，需指向含 project.config.json 的 mp-weixin 构建产物）');
  }

  let ci;
  try {
    ci = await import('miniprogram-ci');
  } catch {
    throw new Error('服务器未安装 miniprogram-ci 依赖，请在 server 工作区执行 npm install');
  }

  // 上传密钥写入临时文件（ci 要求 privateKeyPath；用后即删，不落盘残留）
  const keyFile = path.join(os.tmpdir(), `mp-ci-key-${Date.now()}.key`);
  fs.writeFileSync(keyFile, uploadKey, { mode: 0o600 });
  try {
    const project = new ci.Project({
      appid,
      type: 'miniProgram',
      projectPath: projectDir,
      privateKeyPath: keyFile,
      ignores: ['node_modules/**/*'],
    });
    const result = await ci.upload({
      project,
      version: version || '1.0.0',
      desc: desc || '自运营模式上传',
      setting: { es6: true, es7: true, minify: true, autoPrefixWXSS: true },
      robot: Number(process.env.MP_CI_ROBOT || robot) || 1,
    });
    return result;
  } finally {
    try { fs.rmSync(keyFile, { force: true }); } catch {}
  }
}
