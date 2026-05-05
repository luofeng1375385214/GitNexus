# GitNexus ActionScript 3.0 支持

## 快速开始

```bash
# 1. 排除自动生成文件（推荐，否则索引结果会被噪音淹没）
cat > /path/to/game-project/.gitnexusignore << 'EOF'
src/txdata/vo/
src/txdata/ui/
src/txdata/ro/
src/txdata/Protocol.as
src/txdata/ProtocolData.as
EOF

# 2. 索引项目
gitnexus analyze /path/to/as3-project

# 3. 配置 MCP（AI 工具自动发现 GitNexus）
gitnexus setup

# 4. 查询
gitnexus query "UserModel"                # 搜索符号
gitnexus context UserModel.getName        # 调用关系
gitnexus impact UserModel.getName -d down # 影响分析
```

> **无需编译 C++ 模块。** ActionScript 使用独立正则解析器（`standalone` 策略），不依赖 tree-sitter。原因是 `tree-sitter-actionscript` 语法的 ABI 15 与 GitNexus 使用的 tree-sitter 0.21.x (ABI 14) 不兼容。

---

## 图谱能力

基于 5,000+ 文件的 AS3 游戏项目实测（排除自动生成文件后）：

| 能力 | 数量 | 说明 |
|------|------|------|
| 符号提取 | 124,082 nodes | Class, Interface, Method, Property, Function |
| 调用链 CALLS | 35,000+ | `obj.method()`, `new ClassName()`, 静态调用 |
| 导入追踪 IMPORTS | 26,000+ | 精确导入 + 通配符导入 |
| 继承 EXTENDS/IMPLEMENTS | 580+ | 类继承、接口继承、接口实现 |
| 类结构 HAS_METHOD/HAS_PROPERTY | 106,000+ | 方法→类、字段→类 |
| 字段访问 ACCESSES | 17,000+ | 属性读写追踪 |
| 方法重写 METHOD_OVERRIDES | 500+ | `override function` 自动检测 |
| 执行流 Process | 300+ | 基于 CALLS 链自动推断 |
| 影响分析 / 上下文查询 | 完整支持 | `impact`、`context` 工具 |

---

## 版本要求

| 依赖 | 最低版本 |
|------|----------|
| Node.js | >= 20.0.0 |
| gitnexus | >= 1.7.0（完整 AS3 支持首次包含在此版本） |

---

## 通过 MCP 使用（AI 工具集成）

MCP 是 GitNexus 的核心使用方式。AI 通过 MCP 工具按需查询知识图谱，不需要把代码塞进上下文。

### 配置

```bash
# 一键配置（Claude Code、Cursor、Codex、OpenCode）
gitnexus setup
```

或手动配置（任何支持 MCP 的 AI 工具）：

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "gitnexus",
      "args": ["mcp"],
      "env": {
        "NODE_OPTIONS": "--max-old-space-size=4096"
      }
    }
  }
}
```

> `env.NODE_OPTIONS` 防止大型索引（200 MB+）加载时内存不足导致 MCP 进程崩溃。`gitnexus setup` 会自动包含此配置。

### AI 工具会自动调用吗？

大多数情况下会。在项目的 `CLAUDE.md` 或 `.cursorrules` 中加一条规则效果最好：

```markdown
## 代码查询
本项目使用 GitNexus 索引了代码知识图谱。做代码分析前先用 MCP 工具查询：
- 找代码: query  |  看调用关系: context  |  改代码前做影响分析: impact
```

### 使用示例

| 你说的话 | AI 调用的工具 | 返回 |
|---------|-------------|------|
| "找处理登录的方法" | `query "登录请求"` | 相关符号及位置 |
| "loginReqServerInfo 谁会调用它" | `context "loginReqServerInfo"` | 调用者和被调用者 |
| "改了这个方法会影响什么" | `impact "方法名" -d downstream` | 风险等级 + 受影响符号 |
| "项目有哪些主要执行流程" | `query "主要流程"` | 300 个执行流 |
| "SceneManager.loadMap 的完整调用链" | `context` → `impact` 递归追踪 | 完整调用链 |

### 可用工具

| 工具 | 用途 |
|------|------|
| `query` | 语义/关键词搜索 |
| `context` | 符号的完整上下文（调用者、被调用者、执行流） |
| `impact` | 影响分析（上下游 blast radius） |
| `rename` | 跨文件安全重命名 |
| `detect_changes` | 未提交变更的影响范围 |

### 多项目

`gitnexus mcp` 加载全局注册表中的所有项目索引，AI 通过 `repo` 参数切换：

```bash
gitnexus analyze /path/to/project-a
gitnexus analyze /path/to/project-b
gitnexus list  # 查看所有已注册项目
```

---

## 支持的语法特性

### 完全支持

| 特性 | 示例 | 图谱关系 |
|------|------|---------|
| 包声明 | `package com.example.models { }` | `CONTAINS` |
| 类 / 接口 | `public class UserModel { }` | Class / Interface 节点 |
| 继承 | `class Admin extends User` | `EXTENDS` |
| 接口实现 | `class User implements ISerializable` | `IMPLEMENTS` |
| 方法 | `public function getName():String` | Method + `HAS_METHOD` |
| 变量/常量 | `var name:String`, `const MAX:int` | Property + `HAS_PROPERTY` |
| 精确导入 | `import com.example.models.User;` | `IMPORTS` |
| 通配符导入 | `import com.example.utils.*;` | `IMPORTS` |
| 方法调用 | `obj.method()`, `func()` | `CALLS` |
| new 表达式 | `new ClassName()` | `CALLS` (confidence: 0.9) |
| 字段访问 | `obj.field`, `obj.field = val` | `ACCESSES` (read/write) |
| 方法重写 | `override function init()` | `METHOD_OVERRIDES` |
| getter/setter | `function get name():String` | Method（标记 accessor） |
| 访问修饰符 | `public/private/protected/internal` | 节点属性 `visibility` |
| 静态成员 | `static var count:int` | 节点属性 `isStatic` |

### 已知限制

- 泛型类型（`Vector.<String>`）不提取
- 可选参数不提取默认值
- 自定义命名空间不支持
- 仅解析显式类型注解，不做动态类型推断
- `.mxml` 文件不支持
- Flash/AIR 内置 API 已过滤（不生成 CALLS 边）

---

## 过滤自动生成文件

AS3 游戏项目通常包含大量自动生成代码（协议导出、配置表导出、UI 导出），索引后只会污染搜索结果。

### 常见类型

| 类型 | 文件头特征 |
|------|-----------|
| 协议导出 | `//工具生成，不要修改` |
| 配置表导出 | `Warning: Created by ExcelPack tool` |
| UI 导出 | `Created by the LayaAirIDE` |

在项目根目录创建 `.gitnexusignore`（语法同 `.gitignore`，只影响 GitNexus）：

```gitignore
src/txdata/vo/
src/txdata/ui/
src/txdata/ro/
src/txdata/Protocol.as
src/txdata/ProtocolData.as
```

排除效果：

| 指标 | 排除前 | 排除后 |
|------|--------|--------|
| 索引文件数 | ~13,400 | ~5,100 |
| Nodes | 318,370 | 124,099 |
| Edges | 214,933 | 212,402 |
| 执行流 | 0 | 300 |

> 排除后 Nodes 减少 60%，Edges 反而增加（噪音节点少了，关系更精准）。执行流从 0 提升到 300。

---

## 常见问题

### ActionScript 需要编译 tree-sitter 吗？

不需要。使用独立正则解析器。

### Windows 下索引时 Segfault？

```bash
# 预设 NODE_OPTIONS 跳过 ensureHeap() 的 re-exec（re-exec 在 Windows Git Bash 下会触发 segfault）
NODE_OPTIONS="--max-old-space-size=8192" gitnexus analyze /path/to/project

# 或直接通过 node 运行
cd /path/to/GitNexus/gitnexus
NODE_OPTIONS="--max-old-space-size=8192" node --stack-size=4096 dist/cli/index.js analyze /path/to/project
```

建议写入 `~/.bashrc`：
```bash
export NODE_OPTIONS="--max-old-space-size=8192"
```

### MCP 报错 "Connection closed" (-32000)

MCP 进程崩溃，通常由以下原因导致：

**原因 1：LadybugDB 版本不匹配。** 如果用开发版 `gitnexus analyze` 索引了项目，但 MCP 启动的是全局安装的 `gitnexus`（不同版本），LadybugDB 原生模块读取数据库时会 segfault。

```bash
# 检查版本
gitnexus --version                    # 全局版本
cd GitNexus/gitnexus && node dist/cli/index.js --version  # 开发版本

# 解决：重新索引（使用 MCP 将要启动的同一个 gitnexus 版本）
gitnexus analyze /path/to/project
```

**原因 2：大型索引内存不足。** 索引文件超过 200 MB 时，默认 V8 堆不够。在 MCP 配置中加 `env`：

```json
{
  "command": "gitnexus",
  "args": ["mcp"],
  "env": { "NODE_OPTIONS": "--max-old-space-size=4096" }
}
```

`gitnexus setup` 会自动包含此配置。

**原因 3：开发版指向。** 如果使用本地开发版 GitNexus，确保 MCP 配置指向正确的 `dist/cli/index.js`：

```json
{
  "command": "node",
  "args": ["G:/MyProject/GitNexus/gitnexus/dist/cli/index.js", "mcp"],
  "env": { "NODE_OPTIONS": "--max-old-space-size=4096" }
}
```

### 索引后搜索结果太多无关内容？

用 `.gitnexusignore` 排除自动生成文件，然后 `--force` 重建索引。

### 影响分析显示 0 个受影响节点？

确保指定方向：`--direction downstream`（下游影响）或 `--direction upstream`（上游依赖）。

### 多个项目需要多个 MCP 吗？

不需要。`gitnexus mcp` 加载全局注册表中的所有项目，AI 通过 `repo` 参数切换。

### 可以和其他语言混合索引吗？

可以。所有语言一起索引并建立跨语言引用关系。
