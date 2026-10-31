# 生图 / 改图经验总结

> 归档自仓库根目录（2026-11-01 迁入 `docs/`）。内容来自 2026-10-30 的一次连续改图会话，
> 结论绑定当时的 provider/模型与 Buzz 价格，换通道后需要重新验证。

> 来源：2026-10-30 会话中「白发红瞳少女 → 水魔法师角色」的一组连续迭代。
> 覆盖：元素与角色融合技法、噪点治理、视觉中心简化、改图操作规范、通道踩坑记录。

---

## 一、最高价值的一条：元素即角色（hair-as-element）

### 参考图拆解

用户给的参考图（红发法师施放雷电）：**画面里没有"宠物精灵"或"火元素球"，元素就是她本人。**

拆出来的手法有 5 条：

| 手法 | 具体表现 | 作用 |
|---|---|---|
| **发丝流体化** | 头发从毛束逐渐化为火焰/水流，末端散成飘带 | 元素获得了"生长在人身上"的合理性 |
| **元素充满画面** | 赤红长发从画面左下甩到右上，填满整个画幅 | 大斜线撑起张力，替代背景 |
| **暗底 + 边缘光** | 近乎纯黑星空背景，人物靠冷色轮廓光"剥"出来 | 剪影永远成立，哪里都看得清 |
| **前景穿插** | 闪电、光珠、飞沫从身体前方横穿并越出画框 | 一张平面图造出前后景纵深 |
| **高饱和主色 + 一个补色** | 红橙主导，紫/青只出现在能量上 | 花但不乱 |

### 迁移公式

```
头发本体 = 元素
元素不做生物化（无眼睛、无兽形、无独立精灵）
元素必须填满画面边缘，越界
背景压黑，只留轮廓光
```

### 可直接复用的 prompt 片段（英文）

```text
The elemental force has no separate creature or object — her own hair IS the water.
Near her scalp it still reads as hair, and toward the ends it dissolves into
flowing currents, ribbons and spray.

Composition: strong diagonal X composition, body centered, the hair-water sweeping
in colossal arcs from lower left up to upper right and out of frame.

Background: deep near-black starfield with a faint violet nebula glow, no scenery.

Light: high-contrast rim lighting — cold cyan light carving her silhouette out of
the darkness, a bright cyan-white core glow at her channeling hand.
```

---

## 二、噪点问题：换模型比改 prompt 有效得多

### 实测结论

同一张 16:9 暗底大图：

| 引擎 | 分辨率 | 结果 |
|---|---|---|
| `openai:gpt-image-2` quality=medium | 1792×1008 | 暗部有细密颗粒、抖动点、压缩感脏点，夜空发花 |
| `google:nano-banana-2` image_size=2K | 2741×1530 | 背景平滑、渐变干净、水丝边缘锐利 |

**规律：大面积暗色纯色 + 高对比光效，是 gpt-image-2 的噪点重灾区。**
这类图直接换 `nano-banana-2`，比在 prompt 里反复写 "no grain / clean" 有效。

### 代价

| 通道 | 单张成本（同级） |
|---|---|
| `openai:gpt-image-2`（civitai 通道） | 约 13–26 Buzz |
| `google:nano-banana-2` 1K / 2K / 4K | 104 / 156 / 208 Buzz |
| `google:nano-banana-2-lite`（保身份改图首选） | 44 Buzz |

> 批量出图可降 1K 或换 lite；单张精修再上 2K。

### 去噪 prompt 写法（配合 nano 使用）

```text
The single task is surface cleanup: remove every speck of visual noise.
No film grain, no dithering, no stippling, no color speckle in the dark background,
no random bright dots, no compression artifacts.
The near-black background must be perfectly smooth and deep.
Keep the rendering crisp and glossy — specular sparks only where a droplet catches light.
```

---

## 三、画面"太花"的解法：只允许一个最亮点

用户反馈"还是有点花"。有效的不是"简化"这种形容词，而是**可数的量化指令**：

| 指令类型 | 反面（无效） | 正面（有效） |
|---|---|---|
| 亮点数量 | "reduce highlights" | "cut bright highlight streaks by **two thirds**，只留手心光核" |
| 水体数量 | "simplify the water" | "收成 **2–3 条**大缎带，删掉散碎水珠与飞沫" |
| 背景 | "clean background" | "背景压成**单一平滑深靛紫渐变**，删掉所有星点与星云细节" |
| 负空间 | "more space" | "头部与肩部周围留出干净负空间，脸最先被读到" |

### 三级视觉优先级写法（非常好用）

```text
Composition priority: her face is the focal point, the glowing hand core is the
secondary focus, the water ribbons frame both.
Everything that does not support those three gets deleted.
```

---

## 四、改图操作规范（连续迭代不跑偏）

1. **每次只改一个变量**：造型 → 去噪 → 简化亮点，不要一次要求三件事。
2. **开头先锁死**，再写改动：
   ```text
   Keep this exact image — same composition, pose, face, hair, palette and framing.
   Do not move, crop or redesign anything. The only change is:
   ```
3. **从上一版改，不要从原图重画**：改坏了退回上一版，别每轮重写整段 prompt。
4. **风格锁**：跨版本要保持一致时加一句 `match the existing line weight / flat solid colors / no gradient / no hatching`。
5. **保身份用短硬指令**，不要堆长外貌描写：
   ```text
   Use the exact same girl from the reference — do not redesign her face or change
   her identity. Change only her outfit and scene.
   ```
6. **纯色平涂与素描风互斥**：一旦要求"只有色块 + 轮廓线"，就要明确写 `delete every hatching stroke, every shading line, no texture`，否则模型会把排线当风格保留。

---

## 五、踩坑与运维记录

### 1. Civitai 通道 `ECONNRESET`

- 现象：`fetch failed <- ECONNRESET`，**提交阶段**就断，从未到达上游。
- 含义：**没有出图，也没有扣费**。
- 处理：等 20–30 秒重试即可；曾在同一小时内出现"连续 3 次失败 → 等 30 秒后成功"。
- 不要循环猛试，也不要换 gpt-image-2 试图绕过——同一条通道会一起失败。

### 2. 直连 Google 缺 Key

- `provider="google"` 直连报：`requires the Google Gemini API Key`。
- 走 `provider="civitai"` + `model="google:nano-banana-2"` 才能用 Buzz 计费出图。

### 3. nano-banana 的尺寸规则

- 不吃像素，只认 `aspect_ratio` + `image_size`（1K / 2K / 4K = 长边 1024 / 2048 / 3840）。
- **1K + 16:9 实际只有 1024×576**，细节标注会糊；横向大图建议直接 2K。

### 4. 哪种活该用哪个模型

| 任务 | 首选 |
|---|---|
| 三视图 / 服饰拆解表（要规整网格 + 英文标注） | `openai:gpt-image-2` |
| 戏剧性暗底光效大图 | `google:nano-banana-2` |
| 只换场景、保住人脸 | `google:nano-banana-2-lite` |
| 便宜的风格化批量图 | `sdcpp` / `comfy` + SDXL |

### 5. 附件通道会坏

本次会话用户两次发图都是"图片下载失败"，最终靠**保存到工作区 + 给本地路径**解决：
`E:\dsh\工作区对接QQ\attachments\incoming\...jpg`

---

## 六、本轮产出清单

| 用途 | 文件 |
|---|---|
| 水魔法师（原始戏剧版） | `dsh-image-gen\image-f2decc12.jpg` |
| 三视图 + 服饰拆解（gpt-image-2） | `dsh-image-gen\image-84b11cf5.jpg` |
| 三视图 + 服饰拆解（nano-banana） | `dsh-image-gen\image-4a2666e0.jpg` |
| 夏日海滩 / 泳装版 | `dsh-image-gen\image-83ae859b.jpg` |
| 三个风格方向（扁平 / 粗粝 / 水城） | `image-52da85d0.jpg` / `image-421b07ee.jpg` / `image-16d268ec.jpg` |
| 降噪版 | `dsh-image-gen\image-d0dcd3d3.jpg` |
| 纯平涂版 | `dsh-image-gen\image-05a08d6f.jpg` |
| 非生物水元素 · 平涂版 | `dsh-image-gen\image-f491b735.jpg` |
| 元素即角色（星空版） | `dsh-image-gen\image-82ffbbec.jpg` |
| 换 nano 去噪 2K | `dsh-image-gen\image-f3468dec.jpg` |
| **简亮点定稿** | `dsh-image-gen\image-69641ed8.jpg` |

---

## 七、一句话备忘

> **元素别当道具，让它长在角色身上；**
> **暗底大图别用 gpt-image-2，换 nano-banana；**
> **"太花"靠数字治，不靠形容词；**
> **每次只改一个东西，改前先锁死其余。**
