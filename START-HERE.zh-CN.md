# 从这里开始

这是 env-preflight 第一版源码，含工具、示例、中英文说明、测试和 GitHub Actions 工作流。

## 先试用

安装 Node.js 22 或更新版本，解压后在这个文件夹打开终端：

```sh
npm ci
npm test
npm run demo
```

正常示例应显示 0 个错误。`npm run demo:broken` 会故意展示 3 个配置问题。

完整用法见 `README.zh-CN.md`；实际测试结果见 `docs/validation.md`。

## 检查自己的项目

在本工具文件夹运行 `npm run build`，再进入待检查项目的目录，按 `README.zh-CN.md` 的说明执行检查命令。源码目录不是 `src` 时，通过 `--src` 指定；例如 `--src index.js`。

只想检查代码与示例配置是否一致时使用 `--example-only`，无需提供真实密钥。

## 反馈问题

在项目的 GitHub Issues 中说明你使用的 Node.js 版本、运行命令和预期结果。复现配置请使用虚构值。具体步骤见 `CONTRIBUTING.md`。
