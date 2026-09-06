# env-preflight

**部署 Node.js 项目前，先查出环境变量漏配。**

[English](README.md) · [验证记录](docs/validation.md) · [贡献指南](CONTRIBUTING.md)

代码新增了 `process.env.DATABASE_URL`，示例配置却忘了更新？本工具核对 **代码引用 → 示例配置 → 实际配置**，指出缺少的变量、文件和位置。

支持 JavaScript / TypeScript / JSX / TSX、中英文提示、JSON 和无需真实密钥的 CI 检查。只在本机读文件，不执行应用代码、不联网、不输出配置值。

当前是 **0.1.0 初版实现，尚未发布到 npm**。

## 快速试用

安装 Node.js 22 或更新版本后，在终端执行：

```sh
git clone https://github.com/2024202411/env-preflight.git
cd env-preflight
npm ci
npm test
npm run demo
```

如果查看的是未合并代码，先切到对应开发分支。如果下载的是源码 ZIP，解压后进入 `env-preflight` 文件夹，从 `npm ci` 开始。

`demo` 使用虚构配置，应输出 **1 个源文件、3 个变量、0 个错误**，无需启动服务器。再运行：

```sh
npm run demo:broken
```

应发现三项问题：`DATABASE_URL` 缺失、`API_KEY` 重复、`API_KEY` 为空。此命令故意返回退出码 1，表示查到了问题。

## 检查自己的项目

先在本工具目录执行 `npm run build`，再进入**待检查项目目录**，运行：

```sh
node /本工具所在路径/env-preflight/dist/cli.js --src src --example .env.example --env .env --optional PORT --ignore NODE_ENV --lang zh
```

替换工具路径；有空格时用引号包住。Windows 可使用 `C:/路径/env-preflight/dist/cli.js`。

| 参数 | 作用 |
| --- | --- |
| `--src src` | 源码目录或单个文件；可重复指定 |
| `--example .env.example` | 示例配置 |
| `--env .env` | 实际配置 |
| `--optional PORT` | 允许不填，但代码用了就仍须在示例中声明 |
| `--ignore NODE_ENV` | 不核对此变量是否声明或填写 |
| `--exclude src/fixtures` | 排除路径及子目录，不支持通配符 |
| `--example-only` | 只核对源码和示例，不读实际配置；不能与 `--env` 同用 |
| `--lang zh` / `--json` | 中文提示 / JSON 报告 |
| `--strict` | 提醒也视为失败 |
| `--help` / `--version` | 帮助 / 版本 |

多个变量用英文逗号分隔，如 `--optional PORT,DEBUG`。可选和忽略设置不会隐藏重复定义与格式错误。工具不会自动读取终端的环境变量。

用于 CI 的示例：

```sh
node dist/cli.js --src examples/app --example examples/config/example.env --example-only --strict --lang zh
```

示例配置的值留空是正常的，实际配置需要在部署环境另外检查。

## 结果含义

| 代码 | 含义 |
| --- | --- |
| `MISSING_EXAMPLE` | 代码引用了变量，示例配置没声明 |
| `MISSING_ENV` / `EMPTY_ENV` | 实际配置缺少必填变量 / 必填值为空 |
| `DUPLICATE_KEY` | 同一变量多次定义 |
| `DYNAMIC_ACCESS` / `ENV_OBJECT_USAGE` | 动态变量名或未支持写法，需要人工核对 |
| `INVALID_ENV` / `SOURCE_PARSE` | 配置 / 源码解析失败 |
| `IO_ERROR` / `NO_SOURCE` | 读取失败 / 未找到源码 |
| `UNSUPPORTED_KEY` / `SYMLINK_SKIPPED` | 不支持的变量名 / 跳过源码符号链接 |

退出码 **0** 是通过，**1** 是发现问题，**2** 是检查未完整完成。默认有提醒也可能返回 0；严格检查请加 `--strict`。

报告只含变量名、路径、位置，不含配置值和代码片段。分享前也应确认变量名和路径适合公开。

## 能力边界

- 支持 `process.env.KEY`、静态字符串下标、可选链、对象解构，以及 `node:process` / `process` 的默认、命名空间和 `env` 导入。忽略注释、字符串和局部同名 `process`。
- 不做完整跨文件数据流分析。CommonJS process 导入、`globalThis.process`、自定义包装器和跨模块别名可能漏检。
- 所有源码引用和示例变量默认必填；JavaScript 默认值不会自动将变量标记为可选。确实可选时用 `--optional`。赋值引用也计入。
- 不验证密钥有效性、配置类型或网络连通性。不支持 Vite、Cloudflare 特殊绑定和框架配置覆盖顺序。
- 默认排除依赖与构建目录、类型声明；符号链接提醒后跳过。不会读取 `.gitignore`，额外目录用 `--exclude`。
- dotenv 支持注释、`export`、单／双引号、多行、BOM、Windows 换行。不展开变量、不执行命令，不支持反引号或转义相同的引号分隔符；反斜杠序列按字面处理。不支持的引号格式会报错。

完整默认值、JSON 格式和规则见 [English README](README.md)。

## 开发与反馈

`npm test` 运行测试，`npm run check` 检查类型。欢迎提供虚构值的最小复现。实际验证情况见 [验证记录](docs/validation.md)。采用 [MIT 许可证](LICENSE)。
