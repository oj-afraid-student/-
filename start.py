from pathlib import Path
import argparse
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import venv
import webbrowser

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description='启动知序学习空间')
parser.add_argument('--port', type=int, default=8800)
parser.add_argument('--no-browser', action='store_true')
args = parser.parse_args()
if sys.version_info < (3, 10):
    raise SystemExit('请先安装 Python 3.10 或更新版本。')
url = f'http://127.0.0.1:{args.port}'
try:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', args.port))
except OSError:
    try:
        with urllib.request.urlopen(url + '/api/health', timeout=2) as response:
            if json.load(response).get('service') == 'zhixu':
                if not args.no_browser:
                    webbrowser.open(url)
                print('知序已经在运行：' + url)
                raise SystemExit(0)
    except (OSError, ValueError):
        pass
    raise SystemExit(f'端口 {args.port} 已被其他程序占用，可运行 python start.py --port 8801。')
install_temp = root / 'runtime' / 'install-temp'
install_temp.mkdir(parents=True, exist_ok=True)
os.environ['TEMP'] = str(install_temp)
os.environ['TMP'] = str(install_temp)
env_dir = root / '.venv'
python = env_dir / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
if not python.exists():
    print('正在准备本地运行环境…', flush=True)
    venv.EnvBuilder(with_pip=True).create(env_dir)
installed = subprocess.run([str(python), '-c', 'import django; assert django.get_version() == "5.2.18"'], capture_output=True)
if installed.returncode:
    subprocess.run([str(python), '-m', 'pip', 'install', '--no-index', '--find-links', str(root / 'vendor/wheels'), '-r', str(root / 'requirements.txt')], cwd=root, check=True)
env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
for command in [['migrate', '--noinput'], ['init_catalog']]:
    subprocess.run([str(python), 'manage.py', *command], cwd=root, env=env, check=True)

def open_when_ready():
    for _ in range(50):
        try:
            with urllib.request.urlopen(url + '/api/health', timeout=.5):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(.2)

if not args.no_browser:
    threading.Thread(target=open_when_ready, daemon=True).start()
print('\n知序学习空间：' + url + '\n保持此窗口运行，按 Ctrl+C 关闭服务。\n', flush=True)
try:
    subprocess.run([str(python), 'manage.py', 'runserver', f'127.0.0.1:{args.port}', '--noreload'], cwd=root, env=env, check=True)
except KeyboardInterrupt:
    pass
