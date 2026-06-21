---
spec_version: "1.0"

skill:
  name: "一键竞品分析"
  version: "1.0.0"
  description: "打开竞品官网截图，记录功能要点，生成含产品截图的竞品分析报告"
  author: "reskill"
  tags: ["竞品分析", "截图", "报告生成"]

inputs:
  competitor_name:
    type: string
    required: true
    description: "竞品产品名称"
    examples: ["Figma", "Sketch", "Notion", "Miro"]
  competitor_url:
    type: url
    required: true
    description: "竞品官网地址"
    examples: ["https://figma.com", "https://notion.so"]

outputs:
  analysis_report:
    type: document
    description: "含产品截图和功能分析的竞品分析报告"

systems:
  - name: Chrome
    role: "竞品官网浏览与截图"
  - name: Notion
    role: "分析文档撰写与报告输出"

config:
  display_width_px: 1024
  display_height_px: 768
  max_retries: 3
  step_timeout_sec: 30
  screenshot_interval_sec: 2

variables:
  homepage_screenshot: null
  features_screenshot: null
  pricing_screenshot: null
  pricing_available: true
---

# 一键竞品分析

## Overview
打开竞品官网，依次浏览首页、产品功能页、定价页并截图，将截图和分析要点写入 Notion 文档，AI 综合生成一份含产品截图的功能分析报告。

## Prerequisites
- Chrome 浏览器可用且已登录
- Notion 已登录且可新建页面
- 网络连接正常

## Steps

### 1. open_competitor_site
- type: navigate
- description: "在 Chrome 中打开竞品官网"
- url: "${competitor_url}"
- output: current_page_url
- on_error: retry

### 2. screenshot_homepage
- type: observe
- description: "等待首页加载完成，截取首屏画面"
- action: screenshot
- output: homepage_screenshot
- if: "${current_page_url} contains '${competitor_url}'"
- hint: "等待页面完全加载后再截图，确保主要内容可见。如首页有弹窗（cookie同意、订阅提示），先关闭弹窗"

### 3. navigate_to_features
- type: action
- description: "点击导航栏进入产品功能页面"
- action: click
- text: "Product 或 Features 导航链接"
- hint: "导航标签可能是 Product、Features、Solutions 或产品名，根据实际页面灵活选择最接近的入口"
- on_error: retry

### 4. screenshot_features
- type: observe
- description: "截取产品功能介绍页"
- action: screenshot
- output: features_screenshot
- hint: "如页面较长，向下滚动截取完整内容。关注核心功能列表、差异化亮点、技术架构描述"

### 5. navigate_to_pricing
- type: action
- description: "点击导航栏进入定价页面"
- action: click
- text: "Pricing 导航链接"
- on_error:
    strategy: skip
    reason: "部分竞品不公开定价，跳过此步骤并在报告中注明"

### 6. screenshot_pricing
- type: observe
- description: "截取定价方案页"
- action: screenshot
- output: pricing_screenshot
- if: "${pricing_available} == true"
- hint: "关注套餐层级、价格、免费版边界、核心付费点"

### 7. open_notion
- type: navigate
- description: "切换至 Notion，新建分析文档"
- url: "https://notion.so"
- output: notion_page_ready

### 8. create_document
- type: action
- description: "新建页面，输入文档标题"
- action: type
- text: "${competitor_name} 竞品分析"
- hint: "在 Notion 新页面的标题处输入"

### 9. insert_homepage_analysis
- type: action
- description: "粘贴首页截图并添加分析要点"
- action: key_press
- keys: "control+v"
- hint: "粘贴首页截图后，在其下方添加文字：核心卖点、目标用户、主要CTA"

### 10. insert_features_analysis
- type: action
- description: "粘贴功能页截图并添加分析要点"
- action: key_press
- keys: "control+v"
- hint: "粘贴功能页截图后，在其下方添加文字：核心功能列表、差异化亮点、技术架构"

### 11. insert_pricing_analysis
- type: action
- description: "粘贴定价页截图并添加分析要点"
- action: key_press
- keys: "control+v"
- if: "${pricing_available} == true"
- hint: "粘贴定价页截图后，在其下方添加文字：套餐层级、价格、免费/付费边界"

### 12. generate_analysis_summary
- type: generate
- description: "AI 综合截图和观察记录，生成竞品分析摘要"
- prompt: "基于对 ${competitor_name} 的首页、功能页、定价页的截图和分析要点，生成一份结构化竞品分析摘要：1) 产品定位与核心卖点 2) 核心功能与差异化 3) 定价策略 4) 竞争定位判断与建议"
- output: analysis_summary

### 13. save_document
- type: action
- description: "保存文档"
- action: key_press
- keys: "control+s"
- on_error: skip

## Notes
- 竞品网站结构差异大，导航标签名称不固定，AI 需根据实际页面灵活判断
- 如无 Pricing 页面，步骤 5-6 自动跳过，在报告中注明"未公开定价"
- 截图应包含完整页面内容，长页面需滚动后多张截图拼接
- 生成的分析摘要需用户确认后方可作为最终交付物
- Cookie 同意弹窗等干扰元素应在截图前先关闭
