# GitNexus ActionScript 支持指南

## 概述

GitNexus 支持 ActionScript 3.0 (AS3) 语言的**完整代码索引**，包括符号提取、调用链追踪、继承关系、影响分析和执行流检测。

> **解析方式：** ActionScript 使用**独立正则解析器**（`standalone` 策略），不依赖 tree-sitter 原生绑定。原因是 `tree-sitter-actionscript` 语法的 ABI 15 与 GitNexus 使用的 tree-sitter 0.21.x 运行时 (ABI 14) 不兼容。未来升级 tree-sitter 运行时后会切换回 tree-sitter。

---

## 图谱能力一览

| 能力 | 支持情况 | 说明 |
|------|---------|------|
| **符号提取** | Class, Interface, Method, Property, Function | 自动关联到所属类 |
| **调用链 (CALLS)** | 35,000+ | `obj.method()`, `new ClassName()`, 静态调用 |
| **导入追踪 (IMPORTS)** | 26,000+ | 精确导入 + 通配符导入 |
| **继承 (EXTENDS/IMPLEMENTS)** | 580+ | 类继承、接口继承、接口实现 |
| **类结构 (HAS_METHOD/HAS_PROPERTY)** | 106,000+ | 方法→类、字段→类 |
| **字段访问 (ACCESSES)** | 17,000+ | 属性读写追踪 |
| **方法重写 (METHOD_OVERRIDES)** | 500+ | `override function` 自动检测 |
| **执行流 (Process)** | 300+ | 基于 CALLS 链自动推断 |
| **影响分析 (impact)** | 完整支持 | `impact` 工具可追踪上下游影响 |
| **上下文查询 (context)** | 完整支持 | 查看调用者和被调用者 |

> 以上数据基于一个 5,000+ 文件的 AS3 游戏项目实测。

---

## 版本要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| **Node.js** | >= 20.0.0 | GitNexus 引擎要求 |
| **gitnexus** | >= 1.7.0 | 完整 AS3 支持（调用链、影响分析等）首次包含在此版本 |

ActionScript 不需要 tree-sitter 原生绑定，无需编译 C++ 模块。

---

## 快速开始

```bash
# 索引项目
NODE_OPTIONS="--max-old-space-size=8192" gitnexus analyze /path/to/as3-project

# 查找符号
gitnexus query "UserModel"

# 查看方法的调用者和被调用者
gitnexus context UserModel.getName

# 影响分析（下游 — 改了这个方法会影响什么）
gitnexus impact UserModel.getName --direction downstream

# 影响分析（上游 — 这个方法依赖什么）
gitnexus impact UserModel.getName --direction upstream

# 无 git 项目也可以索引
gitnexus analyze --skip-git /path/to/code
```

---

## Windows 环境注意事项

在 Windows 的 Git Bash 环境下，`gitnexus analyze` 可能因 `ensureHeap()` 的进程重启动（re-exec）触发 Segmentation fault (exit code 139)。表现为进度条在 0% 或 60% 时进程直接退出，无任何错误输出。

**解决方案**：预先设置 `NODE_OPTIONS` 跳过 re-exec：

```bash
# 方式一（推荐）：直接通过 node 运行
cd /path/to/GitNexus/gitnexus
NODE_OPTIONS="--max-old-space-size=8192" node --stack-size=4096 dist/cli/index.js analyze /path/to/project

# 方式二：在 Git Bash 中
NODE_OPTIONS="--max-old-space-size=8192" gitnexus analyze /path/to/project

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

### 排除效果示例

| 指标 | 排除前 | 排除后 |
|------|--------|--------|
| 索引文件数 | ~13,400 | ~5,100 |
| Nodes | 318,370 | 124,099 |
| Edges | 214,933 | 212,402 |
| 执行流 (Process) | 0 | 300 |
| 索引耗时 | 41.5s | 65.6s |

> 排除自动生成文件后，Nodes 减少 60%，Edges 反而增加（因为排除了噪音节点后关系更加精准）。执行流检测从 0 提升到 300。

---

## 支持的 ActionScript 语法特性

### 完全支持

| 特性 | 示例 | 生成的图谱关系 |
|------|------|---------------|
| **包声明** | `package com.example.models { }` | `CONTAINS` File→Namespace→Class |
| **类** | `public class UserModel { }` | Class 节点 |
| **接口** | `public interface ISerializable { }` | Interface 节点 |
| **继承** | `class Admin extends User` | `EXTENDS` |
| **接口实现** | `class User implements ISerializable` | `IMPLEMENTS` |
| **方法** | `public function getName():String` | Method 节点 + `HAS_METHOD` |
| **变量/常量** | `var name:String`, `const MAX:int` | Property 节点 + `HAS_PROPERTY` |
| **导入（精确）** | `import com.example.models.User;` | `IMPORTS` |
| **导入（通配符）** | `import com.example.utils.*;` | `IMPORTS` |
| **方法调用** | `obj.method()`, `func()` | `CALLS` |
| **new 表达式** | `new ClassName()` | `CALLS` (confidence: 0.9) |
| **字段访问** | `obj.field`, `obj.field = val` | `ACCESSES` (read/write) |
| **方法重写** | `override function init()` | `METHOD_OVERRIDES` |
| **访问修饰符** | `public/private/protected/internal` | 节点属性 `visibility` |
| **静态成员** | `static var count:int` | 节点属性 `isStatic` |
| **getter/setter** | `function get name():String` | Method 节点（标记 `accessor`） |

### 已知限制

| 特性 | 说明 |
|------|------|
| **泛型类型** | `Vector.<String>` 等不提取 |
| **可选参数** | 不提取默认值 |
| **自定义命名空间** | 不支持 |
| **动态类型推断** | 仅解析显式类型注解和 import 路径 |
| **MXML 文件** | `.mxml` XML 声明式文件不支持 |
| **Flash/AIR 内置 API** | 已过滤（不生成 CALLS 边） |

---

## 通过 MCP 使用（推荐）

MCP 是 GitNexus 的核心使用方式。AI 通过 MCP 工具按需精准查询知识图谱，不需要把整个项目代码塞进上下文，大幅节省 token。

### 第一步：配置 MCP 连接

```bash
# 一键配置所有支持的 AI 工具（Claude Code、Cursor、Codex、OpenCode）
gitnexus setup
```

或手动配置（Trae、Windsurf 等任何支持 MCP 的工具）：

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

配置完成后重启 AI 工具，MCP 工具自动可用。

### AI 工具会自动调用 GitNexus 吗？

**大多数情况下会，但不是 100%。** AI 工具会在需要理解代码结构时主动调用 MCP 工具，但可靠程度取决于工具和模式：

| AI 工具 | 自动调用 | 说明 |
|---------|---------|------|
| **Claude Code** | 是 | 自动发现 MCP 工具，分析代码时主动调 `query`、`context`、`impact` |
| **Cursor Agent 模式** | 是 | Agent 模式下自动调用，Chat 模式下可能需要提示 |
| **Codex / Windsurf** | 部分 | 取决于 Agent 模式是否开启 |
| **Trae / 其他** | 需引导 | 在对话中提示"用 gitnexus 查一下 xxx" |

**最可靠的做法** — 在项目的 `CLAUDE.md`、`.cursorrules` 或系统提示中加一条规则，让 AI 每次都先查图谱：

```markdown
## 代码查询

本项目使用 GitNexus 索引了完整的代码知识图谱。在做代码分析、重构、bug 定位之前，
先用 gitnexus 的 MCP 工具查询相关代码：
- 找代码: query
- 看调用关系: context
- 改代码前做影响分析: impact
```

这样 AI 工具在动手写代码或改代码之前，都会先查图谱了解上下文，而不是盲猜代码结构。

### 第二步：在 AI 工具中使用

以下以 Claude Code 为例，其他 AI 工具用法相同（自然语言描述即可）。

#### 查找代码符号

```
你: 找一下项目中处理登录请求的方法

AI 会调用: gitnexus query "登录请求"
返回: loginReqServerInfo 等相关符号及其位置
```

#### 查看调用关系

```
你: loginReqServerInfo 这个方法调用了哪些其他方法？谁会调用它？

AI 会调用: gitnexus context "loginReqServerInfo"
返回:
  - incoming (谁调用它): ModuleInitialize 类 (HAS_METHOD)
  - outgoing (它调用谁): reqXltbInfo, reqXlhyInfo, reqInfo, ... (CALLS)
```

#### 影响分析

```
你: 如果我改了 loginReqServerInfo，会影响哪些代码？

AI 会调用: gitnexus impact "loginReqServerInfo" --direction downstream
返回:
  - 风险等级: CRITICAL
  - 直接影响: 381 个符号
  - 影响执行流: 29 个
  - 影响模块: 20 个
  - 详细的受影响符号列表

你: loginReqServerInfo 依赖哪些上游代码？

AI 会调用: gitnexus impact "loginReqServerInfo" --direction upstream
返回: 上游依赖链
```

#### 探索执行流

```
你: 项目中有哪些主要的执行流程？

AI 会调用: gitnexus query "主要流程" --goal "execution flows"
返回: 300 个检测到的执行流，按入口点排序
```

#### 跨文件追踪

```
你: SceneManager.loadMap 的完整调用链是什么？

AI 会调用:
  1. gitnexus context "loadMap" → 查看 loadMap 的调用者和被调用者
  2. gitnexus impact "loadMap" → 查看上下游影响
  3. 对每个关键 callee 递归查询 → 追踪完整调用链
```

### 可用的 MCP 工具

| 工具 | 用途 | 典型问题 |
|------|------|---------|
| `query` | 语义/关键词搜索 | "找一下处理用户登录的代码" |
| `context` | 符号的完整上下文 | "这个方法的调用关系是什么" |
| `impact` | 影响分析 | "改了这个会影响什么" |
| `rename` | 跨文件安全重命名 | "把 loginReqServerInfo 改成 requestServerLogin" |
| `api_impact` | API 路由影响分析 | N/A（AS3 非 Web 后端项目） |
| `route_map` | API 路由映射 | N/A |
| `detect_changes` | 未提交变更的影响 | "我改了这些代码，影响范围多大" |

### 多项目共用一个 MCP

`gitnexus mcp` 加载全局注册表 `~/.gitnexus/registry.json` 中的**所有项目索引**：

```bash
gitnexus analyze /path/to/project-a
gitnexus analyze /path/to/project-b
gitnexus list  # 查看所有已注册项目
```

AI 通过工具的 `repo` 参数切换项目。当工作目录在某个项目下时，默认查询该项目。

### 实际效果示例

以 `loginReqServerInfo` 方法为例：

- **`context`**: 显示它属于 `ModuleInitialize` 类，调用了 `reqXltbInfo`、`reqXlhyInfo` 等 20+ 个方法
- **`impact downstream`**: CRITICAL 风险 — 影响 381 个符号、29 个执行流、20 个模块
- **`impact upstream`**: 显示上游依赖链

---

## 完整示例：索引一个 AS3 游戏项目

```bash
# 1. 创建 .gitnexusignore 排除自动生成文件
cat > /path/to/game-project/.gitnexusignore << 'EOF'
src/txdata/vo/
src/txdata/ui/
src/txdata/ro/
src/txdata/Protocol.as
src/txdata/ProtocolData.as
EOF

# 2. 索引（Windows 下用 node 直接运行避免 Segfault）
cd /path/to/GitNexus/gitnexus
NODE_OPTIONS="--max-old-space-size=8192" node --stack-size=4096 dist/cli/index.js analyze /path/to/game-project

# 3. 配置 MCP
gitnexus setup
```

日常代码更新后重新索引：

```bash
NODE_OPTIONS="--max-old-space-size=8192" node --stack-size=4096 dist/cli/index.js analyze --force /path/to/game-project
```

---

## 常见问题

### ActionScript 需要编译 tree-sitter 原生绑定吗？

不需要。使用独立正则解析器，无需 C++ 编译器。

### Windows 下索引时 Segfault？

见上方 **Windows 环境注意事项**。预先设置 `NODE_OPTIONS="--max-old-space-size=8192"` 即可。

### 索引后搜索结果太多无关内容？

检查是否把自动生成的协议/配置/UI 文件也索引进去了。在项目根目录创建 `.gitnexusignore` 排除这些目录，然后 `--force` 重建索引。

### 影响分析显示 0 个受影响节点？

确保使用 `--direction downstream` 查看下游影响，或 `--direction upstream` 查看上游依赖。默认方向是 upstream。

### 多个项目需要启动多个 MCP 吗？

不需要。`gitnexus mcp` 加载全局注册表中的所有项目索引，AI 通过 `repo` 参数切换项目。

### 可以和其他语言混合索引吗？

可以。所有语言会一起被索引并建立跨语言引用关系。

### 未来会切换到 tree-sitter 解析吗？

计划中。当 tree-sitter 运行时升级或语法重新生成后会切换。
