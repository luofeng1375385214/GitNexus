# GitNexus ActionScript 支持指南

## 概述

GitNexus 现已支持 ActionScript 3.0 (AS3) 语言的代码索引。你可以对 `.as` 文件进行静态分析、符号提取、调用图构建和继承关系追踪。

此外，`--skip-git` / `--no-git` 选项让你可以在**没有 git 仓库**的目录下直接索引代码。

> **解析方式：** ActionScript 当前使用**独立正则解析器**（`standalone` 策略），不依赖 tree-sitter 原生绑定。原因是 `tree-sitter-actionscript` 语法的 ABI 15 与 GitNexus 使用的 tree-sitter 0.21.x 运行时 (ABI 14) 不兼容。未来升级 tree-sitter 运行时后会切换回 tree-sitter。

---

## 版本要求

### 核心依赖

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| **Node.js** | >= 20.0.0 | GitNexus 引擎要求（`engines` 字段） |
| **gitnexus** | >= 1.6.3 | ActionScript 支持首次包含在此版本 |

### 可选原生依赖（ActionScript 不需要）

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| **node-addon-api** | >= 8.0.0 | 原生绑定 API（可选） |
| **node-gyp-build** | >= 4.8.0 | 原生模块构建（可选） |
| **C++ 编译器** | 支持 C11 标准 | 仅编译 tree-sitter 原生绑定时需要 |

### 构建工具（仅开发 / 其他 tree-sitter 语言）

| 工具 | 用途 | 最低版本 |
|------|------|----------|
| **Python 3** | node-gyp 构建 | >= 3.8 |
| **Make** | 编译原生模块 | GNU Make >= 4.0 |
| **C++ 编译器** | tree-sitter 原生绑定 | g++ >= 9 / MSVC >= 2019 |
| **TypeScript** | 编译 GitNexus 源码 | >= 5.4.5 |
| **tree-sitter** | 运行时（其他语言） | >= 0.21.1 |

---

## 使用方法

### 1. 索引一个 ActionScript 项目（有 git）

```bash
gitnexus analyze /path/to/your/as3-project
```

### 2. 索引一个 ActionScript 项目（没有 git）

```bash
gitnexus analyze --skip-git /path/to/your/as3-project
# 或者
gitnexus analyze --no-git /path/to/your/as3-project
```

### 3. 查询索引结果

```bash
# 查找符号
gitnexus query "UserModel"

# 查看某个类的调用者和被调用者
gitnexus context com.example.models.UserModel

# 影响分析
gitnexus impact com.example.models.UserModel
```

---

## Windows 环境注意事项

### Segfault 问题与解决方案

在 Windows 的 Git Bash 环境下，`gitnexus analyze` 可能因 `ensureHeap()` 的进程重启动（re-exec）触发 Segmentation fault (exit code 139)。表现为进度条在 0% 或 60% 时进程直接退出，无任何错误输出。

**解决方案**：预先设置 `NODE_OPTIONS` 跳过 re-exec：

```bash
# 方式一：在 Git Bash 中
NODE_OPTIONS="--max-old-space-size=8192" gitnexus analyze /path/to/project

# 方式二（推荐）：直接通过 node 运行
cd /path/to/GitNexus/gitnexus
NODE_OPTIONS="--max-old-space-size=8192" node --stack-size=4096 dist/cli/index.js analyze /path/to/project

# 方式三：PowerShell
$env:NODE_OPTIONS="--max-old-space-size=8192"
gitnexus analyze "G:\path\to\project"
```

> **建议**：将 `export NODE_OPTIONS="--max-old-space-size=8192"` 写入 `~/.bashrc`，避免每次手动设置。

---

## 过滤自动生成文件

AS3 游戏项目通常包含大量自动生成的代码（协议导出、配置表导出、UI 导出），这些文件索引后只会污染搜索和影响分析结果。建议使用 `.gitnexusignore` 排除。

### 常见自动生成文件类型

| 类型 | 特征 | 示例文件头 |
|------|------|-----------|
| **协议导出** | 网络协议消息 VO | `//工具生成，不要修改` |
| **配置表导出** | Excel/配置表数据类 | `Warning: Created by ExcelPack tool` |
| **UI 导出** | UI 编辑器生成绑定 | `Created by the LayaAirIDE` |

### .gitnexusignore 配置示例

在项目根目录创建 `.gitnexusignore`（语法与 `.gitignore` 相同，只影响 GitNexus 不影响 git）：

```gitignore
# 协议导出文件（目录名视项目而定）
src/txdata/vo/

# UI 导出文件
src/txdata/ui/

# 配置表导出文件
src/txdata/ro/

# 协议定义
src/txdata/Protocol.as
src/txdata/ProtocolData.as
```

### 排除前后的效果对比

以一个 14K AS3 文件的游戏项目为例：

| 指标 | 排除前 | 排除后 |
|------|--------|--------|
| 索引文件数 | ~13,400 | ~6,100 |
| Nodes | 318,370 | 194,642 |
| Edges | 214,933 | 124,405 |
| 索引大小 | 452 MB | 327 MB |
| 索引耗时 | 41.5s | 29.1s |

---

## 支持的 ActionScript 语法特性

### 完全支持

| 特性 | 示例 |
|------|------|
| **包声明** | `package com.example.models { ... }` |
| **类** | `public class UserModel { ... }` |
| **接口** | `public interface ISerializable { ... }` |
| **继承** | `class Admin extends User` |
| **接口实现** | `class User implements ISerializable, IComparable` |
| **函数/方法** | `public function getName():String { ... }` |
| **变量** | `var name:String = "test"` |
| **常量** | `const MAX_SIZE:int = 100` |
| **导入（精确）** | `import com.example.models.User;` |
| **导入（通配符）** | `import com.example.utils.*;` |
| **方法调用** | `obj.method()`, `new ClassName()` |
| **访问修饰符** | `public`, `private`, `protected`, `internal` |
| **静态成员** | `static var count:int` |

### 部分支持 / 已知限制

| 特性 | 当前状态 |
|------|----------|
| **泛型类型** | 不支持 (`Vector.<String>` 等不提取) |
| **可选参数** | 不支持 |
| **getter/setter** | 不支持 |
| **自定义命名空间** | 不支持 |

### 不支持

| 特性 | 说明 |
|------|------|
| **MXML 文件** (`.mxml`) | XML 声明式文件，不支持 |
| **运行时类型推断** | 仅解析显式类型注解 |
| **Flash/AIR 特有 API** | 不识别特殊语义 |

---

## 无 Git 模式

`--skip-git` / `--no-git` 只是将索引根目录设为当前路径：

```bash
gitnexus analyze --skip-git /path/to/code
gitnexus analyze --skip-git --embeddings /path/to/code
```

---

## Web UI 查看索引

索引完成后可以启动 Web UI 可视化浏览：

```bash
# 启动本地服务器（默认端口 4747）
gitnexus serve

# 浏览器访问
# http://localhost:4747
```

如果启动后报 `Cannot GET /`，说明 Web 前端未构建。需要先构建 `gitnexus-web/`：

```bash
cd gitnexus-web
npm run build
# 然后重启 serve
```

---

## 通过 MCP 使用（推荐）

MCP 是 GitNexus 的核心使用方式。AI 通过 MCP 工具按需精准查询知识图谱，不需要把整个项目代码塞进上下文，大幅节省 token。

### 一次性配置

```bash
# 一键配置所有支持的 AI 工具（Claude Code、Cursor、Codex、OpenCode）
gitnexus setup
```

配置完成后，在任何支持的 AI 工具中打开已索引的项目，AI 就能自动使用 GitNexus 的 MCP 工具。

### 多项目共用一个 MCP

`gitnexus mcp` 启动后会加载全局注册表 `~/.gitnexus/registry.json` 中的**所有项目索引**。索引多个项目不需要启动多个 MCP 服务器：

```bash
# 索引项目 A
gitnexus analyze /path/to/project-a

# 索引项目 B
gitnexus analyze /path/to/project-b

# 两个项目的索引都在全局注册表中
gitnexus list
```

AI 通过工具的 `repo` 参数指定查询哪个项目，不传则默认查当前项目。

### MCP 工具 vs Web UI

| | Web UI | MCP（AI 用） |
|---|---|---|
| 方式 | 一次性加载整个图到浏览器 | 按查询只返回匹配的结果 |
| 数据量 | 全量传输（大项目会卡） | 每次通常 10-50 条 |
| 适合场景 | 小项目浏览 | 任意大小的项目 |
| 性能 | 194K nodes 项目会卡 | 查询毫秒级返回 |

### Trae / 其他 MCP 工具手动配置

如果使用的 AI 工具不在 `gitnexus setup` 支持列表中，手动添加 MCP server：

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "gitnexus",
      "args": ["mcp"]
    }
  }
}
```

---

## 完整示例：索引一个 AS3 游戏项目

```bash
# 1. 进入项目目录
cd /path/to/game-project

# 2. 创建 .gitnexusignore 排除自动生成文件
cat > .gitnexusignore << 'EOF'
src/txdata/vo/
src/txdata/ui/
src/txdata/ro/
src/txdata/Protocol.as
src/txdata/ProtocolData.as
EOF

# 3. 索引（设置内存避免 Segfault）
NODE_OPTIONS="--max-old-space-size=8192" gitnexus analyze .

# 4. 配置 MCP 让 AI 能查询知识图谱
gitnexus setup
```

日常代码更新后，重新索引即可：

```bash
# 更新索引（加 --force 强制重建）
gitnexus analyze --force .

# 或者在 Windows Git Bash 下避免 Segfault：
NODE_OPTIONS="--max-old-space-size=8192" gitnexus analyze --force .
```

---

## 常见问题

### Q: ActionScript 需要编译 tree-sitter 原生绑定吗？

不需要。使用独立正则解析器，不依赖 tree-sitter 原生绑定。

### Q: Windows 下索引时 Segfault？

见上方 **Windows 环境注意事项** 章节。预先设置 `NODE_OPTIONS="--max-old-space-size=8192"` 即可。

### Q: 索引后搜索结果太多无关内容？

检查是否把自动生成的协议/配置/UI 文件也索引进去了。在项目根目录创建 `.gitnexusignore` 排除这些目录，然后 `--force` 重建索引。

### Q: 多个项目需要启动多个 MCP 吗？

不需要。`gitnexus mcp` 加载全局注册表中的所有项目索引，AI 通过 `repo` 参数切换项目。用 `gitnexus list` 查看已注册的项目。

### Q: Web UI 很卡怎么办？

Web UI 会一次性加载整个知识图谱，不适合大项目（>5 万 nodes）。大项目建议直接用 MCP 让 AI 精准查询，Web UI 仅用于小项目浏览。

### Q: 可以和其他语言混合索引吗？

可以。所有语言会一起被索引并建立跨语言引用关系。

### Q: 未来会切换到 tree-sitter 解析吗？

计划中。当 tree-sitter 运行时升级或语法重新生成后会切换。
