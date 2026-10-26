from pathlib import Path
import json

root = Path(__file__).resolve().parent
data_path = root/'data'/'demo-data.json'
if not data_path.exists():
    raise SystemExit('Missing data/demo-data.json')
data = json.loads(data_path.read_text(encoding='utf-8'))
styles = (root/'src'/'styles.css').read_text(encoding='utf-8')
core = (root/'src'/'core.js').read_text(encoding='utf-8')
app = (root/'src'/'app.js').read_text(encoding='utf-8')
payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
html = '''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="知序高中数理学习助手：题目模型重构、知识分析与个性化练习的本地交互原型。">
<meta name="color-scheme" content="light">
<title>知序 · 高中数理学习助手</title>
<style>'''+styles+'''</style>
</head>
<body>
<div id="app"></div><div id="overlay"></div>
<noscript>本原型需要启用 JavaScript。请使用现代桌面浏览器打开。</noscript>
<script type="application/json" id="seed-data">'''+payload+'''</script>
<script>'''+core+'''</script>
<script>'''+app+'''</script>
</body></html>
'''
(root/'index.html').write_text(html, encoding='utf-8')
print(f'Built standalone index.html: {len(html.encode("utf-8")):,} bytes')
