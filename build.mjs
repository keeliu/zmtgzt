/**
 * dsh-zmtgzt 构建：
 *   - lib/index.js    服务端 ESM（cordis 插件：工具注册 + 编排契约 + 画像/产物服务 + 路由）
 *   - lib/client.js   客户端单文件 CJS（window.__ModuleLoader__.load 握手；
 *                     react / @deepseek-ai/* 由宿主模块系统提供，保持 external）
 *
 * 两处版本号（package.json / dsh.plugin.json）必须一致，否则构建直接失败——
 * 插件市场上架要求描述与实际一致，版本漂移是最容易漏的一处。
 */
import { build } from 'esbuild'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(here, 'lib'), { recursive: true })

const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
const pluginManifest = JSON.parse(readFileSync(join(here, 'dsh.plugin.json'), 'utf8'))
if (pluginManifest.version !== pkg.version) {
  throw new Error(
    'dsh-zmtgzt build: package.json version (' + pkg.version + ') != dsh.plugin.json version (' +
    pluginManifest.version + ') — 发版前先统一两处版本号'
  )
}

const clientBanner = {
  js: "window.__ModuleLoader__.load({ id: 'dsh-zmtgzt', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
}
const clientFooter = { js: 'return module.exports; } });' }

await build({
  entryPoints: [join(here, 'src/index.ts')],
  outfile: 'lib/index.js',
  bundle: true,
  sourcemap: 'external',
  logLevel: 'info',
  platform: 'node',
  format: 'esm',
  target: ['node22'],
  define: { __EASEL_VERSION__: JSON.stringify(pkg.version) },
  external: ['@deepseek-ai/*', 'node:*'],
  loader: { '.md': 'text' },
})

await build({
  entryPoints: [join(here, 'src/client/index.tsx')],
  outfile: 'lib/client.js',
  bundle: true,
  sourcemap: 'external',
  logLevel: 'info',
  platform: 'browser',
  format: 'cjs',
  target: ['es2022'],
  jsx: 'automatic',
  define: { __EASEL_VERSION__: JSON.stringify(pkg.version) },
  external: [
    '@deepseek-ai/*',
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'scheduler',
  ],
  banner: clientBanner,
  footer: clientFooter,
})

console.log('[dsh-zmtgzt build] done: lib/index.js, lib/client.js')

// 注意：本插件**不打包**任何 Easel 内容。
// 契约（SOUL.md / AGENTS.md）与技能（skills/openclaw/*/SKILL.md）都在运行时
// 从配置的 easelRoot 读取，插件里存副本会与 Easel 官方仓库漂移。
// 详见 src/easel-repo.ts。
console.log(
  '[dsh-zmtgzt build] 契约与技能在运行时从 easelRoot 读取，不随插件分发'
)

