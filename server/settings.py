from pathlib import Path
import os
import secrets

BASE_DIR = Path(__file__).resolve().parent.parent
RUNTIME = BASE_DIR / 'runtime'
RUNTIME.mkdir(exist_ok=True)
key_file = RUNTIME / '.secret-key'
if not key_file.exists():
    try:
        with key_file.open('x', encoding='utf-8') as f:
            f.write(secrets.token_urlsafe(48))
    except FileExistsError:
        pass
SECRET_KEY = os.environ.get('ZHIXU_SECRET_KEY') or key_file.read_text(encoding='utf-8')
DEBUG = False
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '[::1]', 'testserver']
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'learning']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware']
ROOT_URLCONF = 'server.urls'
WSGI_APPLICATION = 'server.wsgi.application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': os.environ.get('ZHIXU_DB_PATH', str(RUNTIME / 'zhixu.sqlite3')), 'OPTIONS': {'timeout': 20}}}
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'Asia/Shanghai'
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_NAME = 'zhixu_session'
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_FAILURE_VIEW = 'learning.views.csrf_failure'
SECURE_CONTENT_TYPE_NOSNIFF = True
DATA_UPLOAD_MAX_MEMORY_SIZE = 131072
APPEND_SLASH = False
