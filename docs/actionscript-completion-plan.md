# ActionScript 完整语言支持补齐计划

> **创建日期：** 2025-05-05
> **状态：** 已实施（Phase 0-7）
> **目标：** 将 ActionScript 从当前的「符号提取 + 继承关系」补齐到与 TypeScript/Java 同等的完整支持，包括 CALLS、IMPORTS、HAS_METHOD、HAS_PROPERTY、CONTAINS、ACCESSES 等全部关系边，以及执行流、影响分析、API 路由等高级特性。

---

## 一、现状分析

### 1.1 当前已实现

| 模块 | 文件 | 状态 |
|------|------|------|
| 语言注册 | `gitnexus-shared/src/languages.ts` | ActionScript 已注册 |
| 语言检测 | `gitnexus-shared/src/language-detection.ts` | `.as` 扩展名已映射 |
| 语言分类 | `gitnexus-shared/src/scope-resolution/language-classification.ts` | 标记为 `experimental` |
| 语言提供者 | `gitnexus/src/core/ingestion/languages/actionscript.ts` | Stub — `parseStrategy: 'standalone'`，所有钩子为空 |
| 正则解析器 | `gitnexus/src/core/ingestion/actionscript-processor.ts` | 提取类、接口、函数、变量、导入 |
| Pipeline Phase | `gitnexus/src/core/ingestion/pipeline-phases/actionscript.ts` | **存在但未注册** — 函数 `processActionScriptPhase` 未接入 pipeline |
| Call 提取配置 | `gitnexus/src/core/ingestion/call-extractors/configs/actionscript.ts` | 最小配置，未接入 |
| Class 提取配置 | `gitnexus/src/core/ingestion/class-extractors/configs/actionscript.ts` | 配置完整（节点类型已声明） |
| Field 提取配置 | `gitnexus/src/core/ingestion/field-extractors/configs/actionscript.ts` | 完整实现（visibility、static、readonly、type） |
| Import 解析配置 | `gitnexus/src/core/ingestion/import-resolvers/configs/actionscript.ts` | 完整实现（JVM 风格，支持通配符） |
| Method 提取配置 | `gitnexus/src/core/ingestion/method-extractors/configs/actionscript.ts` | 完整实现（参数、返回类型、修饰符、注解） |
| Named Bindings | `gitnexus/src/core/ingestion/named-bindings/actionscript.ts` | 完整实现（导入解析） |
| Type 提取 | `gitnexus/src/core/ingestion/type-extractors/actionscript.ts` | 基本实现 |
| Variable 提取配置 | `gitnexus/src/core/ingestion/variable-extractors/configs/actionscript.ts` | 完整实现 |

### 1.2 当前图谱输出

当前 ActionScript 文件处理后产生的图内容：

| 关系类型 | 是否产生 | 说明 |
|----------|---------|------|
| EXTENDS | ✅ | 类和接口的继承 |
| IMPLEMENTS | ✅ | 类实现接口 |
| **CALLS** | ❌ | **完全没有** — 正则有 `call` 和 `newExpr` 模式但未使用 |
| **IMPORTS** | ❌ | 解析了 import 但未生成边 |
| **HAS_METHOD** | ❌ | 函数作为独立节点，未关联到所属类 |
| **HAS_PROPERTY** | ❌ | 变量未关联到所属类 |
| **CONTAINS** | ❌ | 文件→包→类→方法 的层级关系缺失 |
| **ACCESSES** | ❌ | 字段读写追踪缺失 |
| **MEMBER_OF** | ❌ | 方法/属性所属类关系缺失 |
| **METHOD_OVERRIDES** | ❌ | override 方法未追踪 |

### 1.3 Pipeline 注册缺失

`processActionScriptPhase` 函数存在于 `pipeline-phases/actionscript.ts`，但：

1. **未在 `pipeline-phases/index.ts` 中导出**
2. **未在 `pipeline.ts` 的 `buildPhaseList` 中注册**
3. **parse phase 的依赖列表中未包含 `actionscript`**

这导致 ActionScript 文件虽然被扫描到，但从未经过独立的 ActionScript 处理流程。

---

## 二、对比分析：AS vs 成熟语言

| 能力维度 | ActionScript | TypeScript | Java | COBOL |
|----------|-------------|------------|------|-------|
| 解析策略 | standalone (regex) | tree-sitter AST | tree-sitter AST | standalone (regex) |
| CALLS 关系 | ❌ | ✅ 完整 | ✅ 完整 | ✅ 完整（两遍解析） |
| IMPORTS 关系 | ❌ | ✅ | ✅ | ✅ |
| HAS_METHOD | ❌ | ✅ | ✅ | N/A（用 CONTAINS） |
| HAS_PROPERTY | ❌ | ✅ | ✅ | N/A（用 Property 节点） |
| CONTAINS | ❌ | ✅ | ✅ | ✅ File→Module→Namespace→Function |
| EXTENDS/IMPLEMENTS | ✅ 基础 | ✅ 完整 | ✅ 完整 | N/A |
| 方法关联到类 | ❌ | ✅ | ✅ | N/A |
| 变量关联到类 | ❌ | ✅ | ✅ | N/A |
| Pipeline Phase 注册 | ❌ 未注册 | ✅ 走 parse phase | ✅ 走 parse phase | ✅ 独立 cobolPhase |
| 导入→文件路径解析 | ❌ | ✅ tsconfig | ✅ JVM classpath | ✅ copybook map |
| Export 检测 | ❌ (返回 false) | ✅ | ✅ | N/A |
| 类型推断 | ❌ | ✅ 高级 (711行) | ✅ JVM 共享 | N/A |
| MRO 解析 | ❌ | ✅ | ✅ | N/A |
| Framework 检测 | ❌ | ✅ NestJS, Expo | ✅ Spring, JAX-RS | N/A |
| 内置名称过滤 | ❌ | ✅ 50+ 名称 | ✅ | N/A |
| 入口点模式 | ❌ | ✅ | ✅ | N/A |
| 执行流 (Process) | ❌ | ✅ | ✅ | ✅ |
| 影响分析 | ❌ 不可用 | ✅ 完整 | ✅ 完整 | ✅ |
| 查询 (query) | ⚠️ 仅按名称 | ✅ 语义搜索 | ✅ 语义搜索 | ✅ |

---

## 三、实施计划

### Phase 0：Pipeline 接入（优先级：P0 — 阻塞所有后续工作）

**目标：** 让 ActionScript 独立处理流程真正运行起来。

#### 0.1 将 ActionScript Phase 接入 Pipeline

**修改文件：**

- `gitnexus/src/core/ingestion/pipeline-phases/index.ts` — 导出 `actionscriptPhase`
- `gitnexus/src/core/ingestion/pipeline.ts` — 在 `buildPhaseList` 中注册

**参考模式（COBOL）：**

```
scan → structure → [markdown, cobol] → parse → ...
```

**目标依赖图：**

```
scan → structure → [markdown, cobol, actionscript] → parse → ...
```

**具体改动：**

1. 重写 `pipeline-phases/actionscript.ts` 为标准 `PipelinePhase` 对象（当前只是一个裸函数）
2. 在 `index.ts` 中导出
3. 在 `pipeline.ts` 的 `buildPhaseList` 中插入 `actionscriptPhase`，与 `cobolPhase` 并列
4. parse phase 的依赖中添加 `actionscript`（确保 parse 跳过已处理的 .as 文件）

#### 0.2 Parse Phase 过滤 ActionScript 文件

**修改文件：** `gitnexus/src/core/ingestion/parse.ts` 或 `parse-impl.ts`

在文件过滤逻辑中，当文件语言为 ActionScript 时跳过 tree-sitter 解析（因为 standalone 策略已经处理过了）。

**验收标准：**
- [ ] `.as` 文件经过 `actionscriptPhase` 处理
- [ ] parse phase 不处理 `.as` 文件
- [ ] 索引完成后能看到 ActionScript 的 Class、Interface、Function 节点

---

### Phase 1：完善图谱节点和关系（优先级：P0 — 核心能力）

**目标：** 补齐 CONTAINS、HAS_METHOD、HAS_PROPERTY、IMPORTS 关系。

#### 1.1 增强 ActionScript Processor — 作用域感知

**问题：** 当前正则解析器是扁平的 — 所有函数和变量都被提取为顶层节点，不知道它们属于哪个类。

**方案：** 增加简单的括号平衡追踪，确定函数/变量所属的类作用域。

**修改文件：** `gitnexus/src/core/ingestion/actionscript-processor.ts`

**具体改动：**

1. 增加作用域追踪逻辑：
   - 按行迭代源码
   - 遇到 `class`/`interface` 声明时压入作用域
   - 遇到函数/变量时记录当前作用域（即所属类）
   - 括号平衡判断作用域退出

2. 扩展 `AS3ParseResult` 接口：
   ```typescript
   functions: Array<{
     ...existing,
     ownerClass: string | null;  // 所属类名
   }>;
   variables: Array<{
     ...existing,
     ownerClass: string | null;  // 所属类名
   }>;
   ```

3. 增加方法体中的调用提取（见 Phase 2）

#### 1.2 增强 Pipeline Phase — 生成完整关系

**修改文件：** `gitnexus/src/core/ingestion/pipeline-phases/actionscript.ts`

**新增关系：**

| 关系 | 来源 | 目标 | confidence | reason |
|------|------|------|-----------|--------|
| CONTAINS | File 节点 | Package 节点 | 1.0 | `actionscript-file-contains-package` |
| CONTAINS | Package 节点 | Class/Interface 节点 | 1.0 | `actionscript-package-contains-class` |
| HAS_METHOD | Class 节点 | Method 节点 | 1.0 | `actionscript-class-has-method` |
| HAS_PROPERTY | Class 节点 | Property 节点 | 1.0 | `actionscript-class-has-property` |
| IMPORTS | File/Class 节点 | Import 目标 | 0.9 | `actionscript-import` |
| MEMBER_OF | Method 节点 | Class 节点 | 1.0 | `actionscript-method-member-of` |

**实现步骤：**

1. 为每个文件创建 File 节点（如果尚不存在）
2. 如有包声明，创建 Package（Namespace）节点，建立 CONTAINS
3. 为类方法创建 Method 节点（而非独立的 Function 节点），建立 HAS_METHOD
4. 为类变量创建 Property 节点（而非独立 Variable），建立 HAS_PROPERTY
5. 将解析出的 import 语句转为 IMPORTS 关系边
6. 处理 import 通配符：查找 `allPathSet` 中匹配的文件路径

#### 1.3 Import 路径解析

**参考：** COBOL 的 copybook map 和 Java 的 JVM import 解析

**方案：**

1. 精确 import：`import com.example.models.User` → 查找 `com/example/models/User.as`
2. 通配符 import：`import com.example.utils.*` → 查找 `com/example/utils/` 目录下所有 `.as` 文件
3. 使用 structure phase 的 `allPathSet` 做路径匹配

**验收标准：**
- [ ] 每个类的方法出现在 HAS_METHOD 关系中
- [ ] 每个类的字段出现在 HAS_PROPERTY 关系中
- [ ] import 语句生成 IMPORTS 边
- [ ] 文件→包→类 的 CONTAINS 层级正确

---

### Phase 2：CALLS 关系提取（优先级：P0 — 核心能力）

**目标：** 提取方法调用和 `new` 表达式，生成 CALLS 关系边。

#### 2.1 增强正则解析器 — 提取调用

**修改文件：** `gitnexus/src/core/ingestion/actionscript-processor.ts`

**已有正则（未使用）：**

```typescript
call: /(\w+(?:\.\w+)*)\s*\(/g,     // obj.method()
newExpr: /new\s+(\w+)/g,             // new ClassName()
```

**扩展数据结构：**

```typescript
export interface AS3Call {
  callee: string;              // 被调用函数名或完整路径 (obj.method)
  receiver: string | null;     // 接收者 (obj) 或 null
  isNew: boolean;              // 是否是 new 表达式
  ownerFunction: string | null;// 调用发生在哪个函数内
  ownerClass: string | null;   // 调用发生在哪个类内
  line: number;                // 行号
}
```

**提取策略：**

1. 使用作用域追踪（Phase 1.1）确定调用发生的上下文
2. 匹配 `RE.call` 和 `RE.newExpr` 提取调用信息
3. 需要过滤掉语言关键字和控制结构：`if`, `for`, `while`, `switch`, `catch`, `trace`, `super`, `this` 等

#### 2.2 生成 CALLS 关系边

**修改文件：** `gitnexus/src/core/ingestion/pipeline-phases/actionscript.ts`

**关系生成规则：**

| 调用形式 | sourceId | targetId | confidence | reason |
|----------|----------|----------|-----------|--------|
| `obj.method()` | 当前方法 FQN | `obj` 的类型 + `.method` | 0.7 | `actionscript-method-call` |
| `func()` (无 receiver) | 当前方法 FQN | `func` (同包下查找) | 0.6 | `actionscript-local-call` |
| `new ClassName()` | 当前方法 FQN | ClassName FQN | 0.9 | `actionscript-new-expression` |
| `super.method()` | 当前方法 FQN | 父类 + `.method` | 0.85 | `actionscript-super-call` |
| `this.method()` | 当前方法 FQN | 当前类 + `.method` | 0.9 | `actionscript-this-call` |
| `staticCall()` | 当前方法 FQN | import 解析后的 FQN | 0.65 | `actionscript-static-call` |

#### 2.3 两遍解析（参考 COBOL 模式）

由于 AS3 的 import 和类声明顺序不固定（存在前向引用），采用两遍解析：

1. **第一遍：** 创建所有节点 + 未解析的 CALLS 边（confidence: 0.5，targetId 用临时标记）
2. **第二遍：** 所有文件处理完成后，用 import 映射和类名映射解析 targetId，更新 confidence

**验收标准：**
- [ ] 方法调用生成 CALLS 边
- [ ] `new` 表达式生成 CALLS 边
- [ ] 调用上下文（发生在哪个类/方法内）正确记录
- [ ] `gitnexus context SomeClass` 能显示调用者和被调用者
- [ ] `gitnexus impact SomeClass.method` 能追踪影响范围

---

### Phase 3：ACCESSES 关系（优先级：P1 — 增强能力）

**目标：** 追踪字段/属性的读写访问。

#### 3.1 提取字段访问

**修改文件：** `gitnexus/src/core/ingestion/actionscript-processor.ts`

**新增正则：**

```typescript
fieldRead:  /(\w+)\.(\w+)(?=\s*[^\(=])/g,   // obj.field (非调用、非赋值)
fieldWrite: /(\w+)\.(\w+)\s*=/g,               // obj.field = value
```

#### 3.2 生成 ACCESSES 关系

| 访问形式 | sourceId | targetId | reason |
|----------|----------|----------|--------|
| `obj.field` (读) | 当前方法 FQN | 所属类 + field | `actionscript-field-read` |
| `obj.field =` (写) | 当前方法 FQN | 所属类 + field | `actionscript-field-write` |

**验收标准：**
- [ ] 字段读取生成 `ACCESSES { reason: 'read' }` 边
- [ ] 字段赋值生成 `ACCESSES { reason: 'write' }` 边

---

### Phase 4：METHOD_OVERRIDES 关系（优先级：P1）

**目标：** 追踪 override 方法与父类方法的关系。

#### 4.1 在 Phase 中检测 override

当函数标记了 `override` 时：
1. 查找该类的 EXTENDS 目标
2. 在父类中查找同名方法
3. 生成 `METHOD_OVERRIDES` 关系

**验收标准：**
- [ ] `override function` 生成 `METHOD_OVERRIDES` 边指向父类同名方法

---

### Phase 5：Import 路径解析增强（优先级：P1）

**目标：** 将 import 语句解析为实际的文件路径和类 FQN。

#### 5.1 构建 Import 映射

在 Phase 处理所有文件后，构建全局映射：

```
import 路径 → 实际文件路径 → 目标节点 ID
```

**映射规则：**

| Import 形式 | 解析策略 |
|-------------|---------|
| `import a.b.C;` | 查找 `a/b/C.as`，目标为包限定类名 `a.b.C` |
| `import a.b.*;` | 查找 `a/b/` 目录下所有 `.as` 文件 |
| 同包隐式引用 | 同包下的类不需要 import 即可互相引用 |

#### 5.2 跨文件 CALLS 解析

利用 import 映射，将方法调用中的 receiver 解析为具体的类 FQN：

```
import com.example.models.User;
...
var user:User = new User();
user.getName()  → CALLS → com.example.models.User.getName
```

**验收标准：**
- [ ] import 语句解析为文件路径
- [ ] 方法调用的 receiver 能解析到具体的类
- [ ] 通配符 import 正确展开

---

### Phase 6：执行流 (Process) 支持（优先级：P2）

**目标：** 让 ActionScript 代码能被识别为执行流 (Process)，出现在 `query` 和 `context` 的结果中。

**说明：** 执行流检测依赖已有的 `processesPhase`，该阶段基于 CALLS 关系链自动推断执行流。当 Phase 1-2 完成后，ActionScript 的 CALLS 链会被 `processesPhase` 自动拾取，无需额外代码。

**但需要确认：**

1. `processesPhase` 是否会因为 `language: ActionScript` 而跳过某些节点
2. 是否需要将 ActionScript 的内置名称（`trace`, `addEventListener`, `removeEventListener` 等）加入过滤列表

**验收标准：**
- [ ] `gitnexus query "用户登录"` 能返回 AS3 的登录相关执行流
- [ ] Process 节点中包含 ActionScript 的方法节点

---

### Phase 7：质量提升（优先级：P2）

#### 7.1 内置名称过滤

添加 ActionScript 常用内置名称过滤列表，避免将 `trace`, `Math`, `String`, `Array`, `Object` 等系统调用识别为项目内部调用。

```typescript
const AS_BUILTIN_NAMES = new Set([
  'trace', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
  'Math', 'String', 'Number', 'int', 'uint', 'Boolean', 'Array',
  'Object', 'Date', 'RegExp', 'Error', 'Vector',
  'addEventListener', 'removeEventListener', 'dispatchEvent',
  'hasEventListener', 'toString', 'valueOf', 'hasOwnProperty',
  // Flash/AIR runtime
  'flash', 'mx', 'spark', 'fl',
]);
```

#### 7.2 入口点模式

```typescript
entryPointPatterns: [
  /\/src\/\w+\.as$/,           // src 下的主类
  /\bMain\.as$/,               // Main 类
  /\bApp\.as$/,                // App 类
  /\bApplication\.as$/,        // Application 类
  /\bDocumentClass\.as$/,      // 文档类
],
```

#### 7.3 Export 检测

AS3 中 `public` 类等同于 export，改进 exportChecker：

```typescript
exportChecker: (node) => {
  return node.properties?.visibility === 'public';
},
```

#### 7.4 AS3 Framework 检测（可选）

| 框架 | 检测特征 |
|------|---------|
| **Starling** | `import starling.display.Sprite` |
| **Feathers** | `import feathers.controls.*` |
| **PureMVC** | `import org.puremvc.as3.*` |
| **Robotlegs** | `import org.robotlegs.*` |
| **LayaAir** | `import laya.*` |

**验收标准：**
- [ ] 内置名称的调用不产生 CALLS 边
- [ ] 入口点模式正确标记主类

---

### Phase 8：文档更新与测试（优先级：P2）

#### 8.1 更新 `docs/actionscript-support.md`

- 更新「支持」和「部分支持」表格
- 新增 CALLS / IMPORTS / Process 相关说明

#### 8.2 更新语言分类

将 `language-classification.ts` 中 ActionScript 从 `experimental` 升级为 `production`。

#### 8.3 测试

- 使用真实 AS3 游戏项目验证索引质量
- 对比补齐前后的图统计（nodes、edges 数量）
- 验证 `query`、`context`、`impact` 工具的返回结果

---

## 四、实施优先级总结

| 阶段 | 优先级 | 工作量估计 | 阻塞关系 |
|------|--------|-----------|---------|
| Phase 0: Pipeline 接入 | **P0** | 1-2 小时 | 阻塞所有后续 |
| Phase 1: 完善节点和关系 | **P0** | 4-6 小时 | 依赖 Phase 0 |
| Phase 2: CALLS 关系 | **P0** | 6-8 小时 | 依赖 Phase 1 |
| Phase 3: ACCESSES 关系 | P1 | 2-3 小时 | 依赖 Phase 2 |
| Phase 4: METHOD_OVERRIDES | P1 | 1-2 小时 | 依赖 Phase 1 |
| Phase 5: Import 解析增强 | P1 | 3-4 小时 | 依赖 Phase 2 |
| Phase 6: 执行流支持 | P2 | 1-2 小时 | 依赖 Phase 2（大部分自动） |
| Phase 7: 质量提升 | P2 | 2-3 小时 | 依赖 Phase 2 |
| Phase 8: 文档与测试 | P2 | 2-3 小时 | 依赖所有阶段 |

**关键路径：** Phase 0 → Phase 1 → Phase 2 → Phase 6

完成 Phase 0-2 后，ActionScript 即具备与 COBOL 同等的核心能力（CALLS + IMPORTS + CONTAINS + 继承），可以支持 `query`、`context`、`impact` 等核心查询。

---

## 五、技术决策

### 5.1 为什么不切换到 tree-sitter？

`tree-sitter-actionscript` 的 ABI 15 与 GitNexus 的 tree-sitter 0.21.x (ABI 14) 不兼容。修复需要：
1. 等 tree-sitter 运行时升级到支持 ABI 15，或
2. 重新生成 grammar 为 ABI 14

这两个方案都不受我们控制。因此采用与 COBOL 相同的 standalone 正则策略，优先补齐功能。

### 5.2 正则 vs AST 的局限

正则解析的已知局限（已在 `actionscript-support.md` 中记录）：
- 泛型类型 (`Vector.<String>`) 不提取
- 可选参数不提取
- getter/setter 有限支持
- 复杂嵌套表达式中的调用可能遗漏

这些局限不影响核心功能（CALLS、IMPORTS、继承关系），可在后续版本迭代优化。

### 5.3 作用域追踪方案

不实现完整的 AST，采用「轻量括号平衡 + 关键字锚定」：
- 遇到 `class`/`interface` 时开始追踪括号深度
- 函数/变量在哪个括号深度范围内就属于哪个类
- 精度足以覆盖 95%+ 的 AS3 代码（AS3 不允许在一个文件中定义多个顶层类）

---

## 六、参考文件

| 参考对象 | 文件路径 | 用途 |
|---------|---------|------|
| COBOL Phase | `pipeline-phases/cobol.ts` | standalone phase 注册模式 |
| COBOL Processor | `cobol-processor.ts` | 两遍解析、CALLS/IMPORTS 生成 |
| Pipeline 注册 | `pipeline.ts` | Phase 注册和依赖图 |
| TypeScript Provider | `languages/typescript.ts` | 完整语言提供者参考 |
| 现有 AS Processor | `actionscript-processor.ts` | 当前正则解析基础 |
| 现有 AS Phase | `pipeline-phases/actionscript.ts` | 当前 Phase 函数 |
