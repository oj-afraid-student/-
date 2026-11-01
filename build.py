from pathlib import Path
import base64
import json

root = Path(__file__).resolve().parent
data = json.loads((root / 'data' / 'seed.json').read_text(encoding='utf-8'))
image = root / 'assets' / '三棱柱_演示题.png'
data['example']['image'] = 'data:image/png;base64,' + base64.b64encode(image.read_bytes()).decode('ascii')
data['example']['fileSize'] = image.stat().st_size
payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
styles = (root / 'src' / 'styles.css').read_text(encoding='utf-8')
scripts = '\n'.join((root / 'src' / name).read_text(encoding='utf-8') for name in ['geometry.js', 'core.js', 'model-view.js', 'app.js'])
html = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="知序中期展示：登录、浏览资料、模拟上传立体几何题图、解析并确认入库。">
<meta name="color-scheme" content="light"><title>知序 · 我的学习资料</title>
<style>''' + styles + '''</style></head><body><div id="app"></div><div id="overlay"></div><div id="toast-root" aria-live="polite"></div>
<noscript>请启用 JavaScript 后打开知序演示。</noscript>
<script id="seed-data" type="application/json">''' + payload + '''</script>
<script>''' + scripts + '''</script></body></html>
'''
(root / 'index.html').write_text(html, encoding='utf-8')
print(f'Built standalone V1.0 index.html ({len(html.encode("utf-8")):,} bytes).')
