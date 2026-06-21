---
spec_version: "1.0"

skill:
  name: "工单自动答疑"
  version: "1.0.0"
  description: "读取待处理工单内容，在知识库中搜索相关解决方案，生成并发送专业回复"
  author: "reskill"
  tags: ["工单处理", "客服", "知识库", "自动回复"]

inputs:
  ticket_title:
    type: string
    required: true
    description: "工单标题或关键词"
    examples: ["登录失败", "退款流程咨询", "权限配置问题"]
  ticket_system_url:
    type: url
    required: true
    description: "工单系统地址"
    examples: ["https://support.internal.com"]

outputs:
  reply_content:
    type: string
    description: "发送给用户的工单回复内容"
  kb_reference:
    type: string
    description: "引用的知识库文档链接"

systems:
  - name: 工单系统
    role: "工单阅读与回复发送"
  - name: 知识库
    role: "解决方案检索与参考"

config:
  display_width_px: 1024
  display_height_px: 768
  max_retries: 3
  step_timeout_sec: 30
  screenshot_interval_sec: 2

variables:
  ticket_detail: null
  kb_solution: null
  kb_url: null
  reply_sent: false
---

# 工单自动答疑

## Overview
打开工单系统，阅读待处理工单内容，在知识库中搜索相关解决方案，根据工单内容调整方案措辞后发送回复。

## Prerequisites
- 工单系统已登录
- 知识库系统已登录
- 网络连接正常

## Steps

### 1. open_ticket_system
- type: navigate
- description: "打开工单系统"
- url: "${ticket_system_url}"
- output: current_page_url
- on_error: retry

### 2. find_ticket
- type: action
- description: "在工单列表中搜索并打开目标工单"
- action: click
- text: "搜索框或筛选器"
- hint: "使用搜索功能查找 ${ticket_title} 相关工单，或在待处理列表中找到匹配项"

### 3. type_search_query
- type: action
- description: "在搜索框中输入工单关键词"
- action: type
- text: "${ticket_title}"

### 4. open_ticket_detail
- type: action
- description: "点击搜索结果中的工单，打开详情页"
- action: click
- text: "匹配的工单条目"
- output: ticket_detail
- hint: "选择最匹配的工单，阅读用户的问题描述和上下文信息"

### 5. screenshot_ticket
- type: observe
- description: "截取工单详情，记录用户问题"
- action: screenshot
- output: ticket_screenshot
- hint: "关注：问题描述、错误信息、用户环境、复现步骤"

### 6. open_knowledge_base
- type: navigate
- description: "切换至知识库，搜索相关解决方案"
- url: "confluence.internal"
- hint: "如知识库地址不同，根据实际配置访问"

### 7. search_knowledge_base
- type: action
- description: "在知识库中搜索 ${ticket_title} 相关解决方案"
- action: type
- text: "${ticket_title}"
- hint: "使用工单关键词搜索，如无结果可尝试缩短关键词或使用同义词"

### 8. select_solution
- type: action
- description: "在搜索结果中选择最匹配的文档"
- action: click
- text: "最相关的搜索结果"
- output: kb_solution
- on_error:
    strategy: ask_user
    reason: "知识库中未找到直接匹配的方案，需人工补充或选择"

### 9. screenshot_solution
- type: observe
- description: "截取解决方案文档内容"
- action: screenshot
- output: solution_screenshot

### 10. switch_to_ticket
- type: action
- description: "切回工单系统，准备编写回复"
- action: key_press
- keys: "control+tab"
- hint: "切换回工单系统的浏览器标签页"

### 11. click_reply
- type: action
- description: "点击回复按钮，打开回复编辑框"
- action: click
- text: "Reply 或 回复 按钮"

### 12. generate_reply
- type: generate
- description: "AI 根据工单内容和知识库方案，生成个性化回复"
- prompt: "根据以下信息生成一份专业的工单回复：\n工单问题：${ticket_detail}\n参考方案：${kb_solution}\n\n要求：1) 先确认用户的问题 2) 给出清晰的解决步骤 3) 如方案不完整，提示用户补充信息 4) 语气友好专业"
- output: reply_content

### 13. type_reply
- type: action
- description: "将生成的回复粘贴到回复框中"
- action: type
- text: "${reply_content}"
- hint: "粘贴后检查格式是否正确，必要时调整换行和段落"

### 14. send_reply
- type: action
- description: "发送回复"
- action: click
- text: "Send 或 发送 按钮"
- output: reply_sent
- on_error: retry

## Notes
- 知识库中可能没有直接匹配的方案，需要模糊搜索或人工补充
- 回复内容需根据具体工单内容调整，避免直接复制粘贴解决方案
- 如果工单涉及敏感信息（密码重置、账号恢复），建议转交人工处理
- 搜索知识库时可尝试多种关键词组合提高匹配率
- 回复发送前应确认内容准确且无敏感信息泄露
