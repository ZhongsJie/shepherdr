# Shepherdr 开发经验总结

> 记录本次在 macOS arm64 上安装、改造 Shepherdr 布局的经验，供后续维护参考。
> 维护者环境：macOS arm64 26.5.2，Homebrew 在 `/opt/homebrew`。

## 环境与版本

| 组件 | 版本 | 位置 |
|---|---|---|
| 源码 checkout | Shepherdr 3.1.33 | `~/Documents/AI/shepherdr` |
| Herdr app | 0.1.15 | `~/.config/herdr-app` |
| hc (herdr-core) | 0.1.21 | `~/.config/herdr-app/bin` |
| Bun | 1.4.4 | 全局（npmmirror 安装） |
| CLI 命令 | — | `~/.local/bin`（shepherdr / herdr-task / herdr-secret / herdr-browser / herdr-artifact） |

## 关键路径（4 个地方，别搞混）

1. **源码**（改代码在这里）：`~/Documents/AI/shepherdr`
2. **Herdr app 运行时**（layout / mods 部署到这里）：`~/.config/herdr-app`
3. **Shepherdr 自己的数据**：`~/.config/shepherdr`（settings）、`~/.local/share/shepherdr`（service 入口 + web）、`~/.local/state/shepherdr`
4. **共享状态**：`~/.config/herdr-app/shared.json`（HerDr 把共享状态存在内存里，可能写回，别直接改文件）

源码目录必须放在**持久位置**（`~/Documents`），不要放 `/tmp`（重启清空，`shepherdr update` 会找不到源）。

## 标准「编译」循环

Shepherdr 是 JS 项目，没有编译步骤，「编译」= 同步共享模块 + install 部署 + 校验：

```bash
cd ~/Documents/AI/shepherdr
export PATH="$HOME/.local/bin:$PATH"

# 1. 同步 lib/ 共享模块到各 mod（只改了 mods/ 或 layouts/ 可跳过）
python3 bin/sync-shared

# 2. 部署。--keys keep 和 --yes 必须和 ./install.sh 在【同一行】！
BUN_CONFIG_REGISTRY=https://registry.npmmirror.com ./install.sh --keys keep --yes

# 3. 校验
bun run typecheck        # tsc --noEmit
shepherdr doctor         # 应显示 ✓ whole
herdr-app check mods/<名字>   # 单个 mod 检查（WARN 关于 exec sh/hc 是正常的）

# 4. 让改动生效（见下表）
```

### 改动生效方式

| 改了什么 | 生效方式 |
|---|---|
| `mods/`（窗口界面） | 重载布局：`herdr-app do layout.switch --name main` 再切回 `shepherdr`；或重启窗口 |
| `service/`、`web/`、`core/`（后端/任务/网页） | 重启 launchd 服务：`launchctl kickstart -k gui/$(id -u)/dev.shepherdr.service` |
| `layouts/` | 切走布局再切回刷新 |

## 安装时的坑

### 1. Bun 下载慢 / 卡住
GitHub release 下载只有 ~200KB/s 会挂。改用 **npmmirror**：

```bash
npm install -g bun --registry=https://registry.npmmirror.com
# npm 默认拦 postinstall 脚本，需要手动补跑：
node $(npm root -g)/bun/install.js
```

### 2. `--keys keep` 被换成错误的值
`./install.sh` 不带 `--keys keep` 时会用 Shepherdr 默认键位**覆盖**用户键位。
本次实际踩坑：一句命令换行成两行后，`--keys keep --yes` 被 zsh 当第二条命令报
`command not found`，install 其实**没带** `--keys keep` 跑了，结果把用户的
`terminal ctrl-v = terminal.paste_image` 覆盖成 `terminal.paste`。

**教训**：
- 命令必须写成一行（或换行前加反斜杠 `\`）。
- install 输出出现 `- kept your key ...` 才说明 `--keys keep` 生效。
- 丢了键位可从安装前备份 `~/.shepherdr-preadd-backup-*/keys.json` 找回，
  对比差异后只恢复被覆盖的项（当前 `keys.json` 结构：`global` / `terminal` / `mod:chat` / `layout:shepherdr`）。

### 3. install 是增量部署
`~/.config/herdr-app/data/shepherdr/installed.json` 记录每个文件的 sha256，
install 只更新变动的文件（输出 `files: 844 same` 或 `1 update`）。所以改完源再
install 一次，改动文件才会进运行时。

## 共享模块规则（重要）

- mod 只能 import **自己文件夹内**的文件。
- 多个 mod 共用的代码放 `lib/`，由 `bin/sync-shared` 按 `lib/COPIES` 的清单拷贝进各 mod。
- **不要在 mod 里直接手写共享代码**，改 `lib/` 里的源再 `python3 bin/sync-shared`。
- 改完 lib 后 sync + install 都要跑，否则运行时 mod 还是旧拷贝。

## 键位（keys.json）开发经验

- 键位文件：源码 `keys.json` + 运行时 `~/.config/herdr-app/keys.json`；install 时 `merge_keys()` 合并。
- section：`global` / `layout:<name>`（某布局生效）/ `terminal`（终端焦点）/ `mod:<name>`；越具体越优先。
- 动作格式：
  - 内置命令：`"ctrl-shift-t": "tab.new"`，带参数用冒号 `"alt-1": "space.select:1"`。
  - 发给 mod：`"<mod>.<command>"`，mod 用 `nextCommand()` 循环收（收到的命令名不带 mod 前缀）。
  - 结构化参数用对象：`{"command":"layout.resize","args":{"id":"sidebar","px":240}}`。
- **新键自动合并**：`merge_keys()` 里用户没占用（`cur is None`）的键直接添加；被占用才按 `--keys keep|ours|ask` 处理。所以新增快捷键只需改源码 `keys.json` 再 install。
- macOS 的 Command 键写 `cmd`（如 `cmd-s`）；带修饰用连字符（`ctrl-shift-w`、`cmd-shift-]`）。

## 本次功能改动清单

源码工作树累计改动（含 pi 支持、默认值、UI 调整），已提交到 git：

1. **pi 编码代理支持**：`core/`、`lib/`、mods、python task runner、`service/`、`web/`、docs 共约 41 个文件、~1000 行。任务能启动 `pi --model ... --thinking off --session-id <uuid>` 并跑到 Ready。
2. **新空间默认终端模式**（不是 Assistant/coordinator）：
   - `core/settings.js`：`assistant` 开关 `defaultOn: false`，key `coordinator.auto`。
   - `lib/coordinator.js`：`autoCoordinator()` 改为 `shared("coordinator.auto") === true`。
   - `mods/shepherdr-settings/layout.js`：`flag(key, defaultOn=true)`。
   - `service/window.ts` / `service/spaces.ts`：false 默认逻辑。
   - 验证：`~/.config/herdr-app/shared.json` 无 `coordinator.auto` key → 终端默认生效。
3. **侧栏空格状态点**（`mods/spaces-chat/main.js`）：
   - `working`=琥珀呼吸点、`blocked`=红实心、`done`=绿实心、`idle`=灰圈。
   - 固定 10px 槽位避免行抖动；颜色用 `ui.js` 的 `amber()/red()/green()`。
4. **侧栏折叠按钮移到 tab 栏、折叠后侧栏完全消失**：
   - `mods/tabs-tasks/main.js`：tab 栏加 `#sidebar-toggle`，图标始终用
     `mods/workspace-chrome-shepherdr/sidebar.svg`（不要换成 chevron/`>`）。
   - 折叠 = `layout.hide sidebar`；展开 = `layout.show sidebar/sidebar-lists/sidebar-footer`。
   - `mods/workspace-chrome-shepherdr/main.js`：brand 行不再管折叠，只留 logo + voice + search。
5. **折叠快捷键 Cmd+S**（`keys.json` + `mods/tabs-tasks/main.js`）：
   - `layout:shepherdr` 加 `"cmd-s": "tabs-tasks.toggle-sidebar"`。
   - mod 的 command 循环加 `toggle-sidebar` 分支，与按钮点击同一 show/hide 逻辑。
   - 只在 shepherdr 布局生效；要全局就移到 `global` 段。
6. **红绿灯垂直对齐**（`layouts/shepherdr.json`）：
   - `traffic_lights` 是 macOS 系统窗口按钮覆盖层，`[x, y]` 里 `y` 是按钮圆点顶部，
     圆点直径 ~12px，圆心 = `y + 6`。
   - tabs 节点 `px: 42`，图标容器 `H.sm = 24` 居中 → 图标圆心在 21px。
   - 原 `y=16` 圆心 22，改成 `y=15` 后圆心 21，正好对齐工具栏所有图标。
   - 想微调：偏上则 `y+1`，偏下则 `y-1`，改完 install + 切换布局。
7. **键位保留**：`terminal ctrl-v = terminal.paste_image`。

## 遇到的问题与解决

| 问题 | 解决 |
|---|---|
| Bun 下载挂起 | npmmirror + 手动 `node install.js` |
| `/tmp` 源码重启丢失 | 移到 `~/Documents/AI/shepherdr` |
| 默认 Assistant 打开 | 改源码默认值（`defaultOn:false`），不直接改 shared.json |
| 侧栏折叠后留 rail / 按钮消失 | 折叠按钮放 tab 栏，`layout.hide sidebar` 整体隐藏 |
| 红绿灯和工具栏不对齐 | `traffic_lights` y 16→15 |
| 键位被覆盖 | 写成一行 + `--keys keep`，从备份恢复 |

## 配额 / 模型

- `cc-switch-agentplan/deepseek-v4-pro` 曾 429 AccountQuotaExceeded（周期额度用尽，次日重置）。
- 可用替代：`cc-switch-qianwenai/deepseek-v4.1-flash-1017`。
- pi 会话目录：`~/.pi/agent/sessions/--<realpath 去斜杠，/ 和 : 换成 ->--`；`pi --list-models` 约 1s。

## 后续建议（未完成）

- [x] 源码改动已 git 提交（见 `git log`），`shepherdr update` 可正常 `git pull --ff-only`。
- [ ] web 侧栏（`web/plugins/places/client.tsx`）还没有四态状态点视觉，与窗口侧栏不一致。
- [ ] Tailscale 未装 → 网页 app 只能 127.0.0.1 访问，手机/其他设备用不了。
- [ ] 无 ElevenLabs key → 语音通话/听写不可用。
- [ ] 建议给任务建一个指向真实 git 仓库的空间（`spc8d789cfd2db8682c5a3ec9337638de4` 现在指向 `~/`，不是仓库）。