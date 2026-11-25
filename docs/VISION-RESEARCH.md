# 0.2视觉路线证据（2026-11-23，北京时间）

## 为何用专用本机服务

- [SmolVLM2-500M官方卡](https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct)：Apache-2.0；官方语言标英语；图/多图/视频，不是原生音频联合理解。卡片“视频推理1.8GB GPU RAM”不是本用户Mac或浏览器的硬件保证。本项目未把它当成经过中文金融图表验证的答案。
- 当前安装的Transformers.js 4.3.2源码注册有SmolVLM、Qwen3-VL与Qwen3.5架构，说明浏览器路径不是“绝对不可能”；但架构注册不等于任意GGUF/ONNX权重、WASM/WebGPU性能和中文图表质量已通过。在同一浏览器同时运行ASR与VLM还会争夺资源。本次选择已经实际CPU测试的独立本机引擎，不声称浏览器小VLM不可用。
- [Qwen3-VL 2B官方GGUF](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF)：CPU/Apple Silicon等支持路径；Q4语言＋Q8视觉约1.55GB。实际两轮测试能读趋势、关键点并识别故意矛盾，但会错读轴范围、伪列冲突、重复，并给非ASR文字臆造ASR错词例子。因此不作为最终默认质量证据，失败原始记录保留。
- [Qwen3.5-2B官方原始卡](https://huggingface.co/Qwen/Qwen3.5-2B)是更新的2B视觉语言架构；官方自己将小参数版定位为原型/研究用途。其公开基准不能当成本应用准确率。本项目仅依据自己的少量合成图实测选择，不能宣称一般股票分析可靠。
- 最终候选采用[Unsloth公开量化](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF)，revision `f6d5376be1edb4d416d56da11e5397a961aca8ae`，Q5_K_M语言＋F16视觉，Apache-2.0。总下载2,103,465,920字节。启动脚本固定revision和SHA256，缓存不打包。

## 引擎与网络限制

- [llama.cpp官方发布](https://github.com/ggml-org/llama.cpp/releases)列出Mac Apple Silicon、Intel以及Linux CPU发行。Mac路径是可复制安装说明，未在用户设备安装或实测。
- box实际引擎为官方Ollama 0.40.17 Linux发行包中独立的llama-server，报告`0.9.0-dev / 17701e48d`，使用CPU、4推理线程；没有假设大GPU。没有用浏览器/CDP/Playwright操作网页。
- 最初尝试独立目录Ollama本机服务并关闭云功能，`ollama pull`的模型blob重定向被网络拒绝（目标解析为非公网地址），该下载失败，未绕过或手工访问被拒绝目标。改用独立llama.cpp运行路线及另一公开发行源HF GGUF；下载、SHA256校验和CPU模型加载均实际成功。未注册、付费或使用远程推理。
- 模型实际视觉入口是OpenAI兼容`image_url`数据块；代理禁止远程URL/任意模型选择，仅连本机11437，验证同源Origin和请求硬预算。单测覆盖该图片通信边界，不能再只测模型函数而漏掉“图片被接口忽略”。

## 证据文件

- `test-results/vision-smoke-baseline.json`、`vision-qwen3vl-refined.json`：旧Qwen3-VL两轮真实输入/输出和缺陷。
- `vision-qwen35-first.json`：Qwen3.5初测，清晰图只复述标题而漏视觉数据点，不能当联合理解完全合格；因此进一步明确视觉关系与数据点优先的任务要求。
- `vision-smoke.json`、`vision-overview.json`：最终候选真实HTTP同一路径结果、耗时、结构和语义检查。测试讲解明确非ASR，图表明确虚构；不混入真实用户结果。
- GUI、真实Mac性能、中文/混合技术视频和更复杂金融图表仍需独立验收。任何小样本通过都不是无幻觉保证。

## 二次自由汇总被拒绝，默认采用有来源的汇编

最终Qwen3.5视觉分段已能正确读清晰DEMO数据点、总体上升/中途回落，识别讲解80与图上120的冲突，模糊图不猜代码/数字。但二次全段模型把30–60秒的“80”串入60–90秒的模糊窗口；原始结果保留在`vision-overview-freeform-rejected.json`，这不是通过项。

因此默认产品不再调用第二次自由生成。全段概览按固定时间与帧ID汇编已完成的真实视觉AI分段摘要、冲突与警告；每条直接引用其原窗口，未看清窗口使用明确拒绝结论。该汇编层是规则，不冒充额外全局AI推断，也不能消除分段模型本身的错误。这保留了真实“图表＋讲解联合分析”，避免附加生成把证据串错。需要跨段因果/更深全局推理属于下一步能力，不声称0.2已经实现。
