import json
import re
from decimal import Decimal, DecimalException
from functools import wraps
from pathlib import Path
from django.conf import settings
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.http import JsonResponse, FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.views.decorators.cache import never_cache
from django.views.static import serve
from .models import Unit, Question, UnitProgress, Practice, Material


def response(data, status=200):
    return JsonResponse(data, status=status, json_dumps_params={'ensure_ascii': False})


def error(message, status=400):
    return response({'error': message}, status)


def csrf_failure(request, reason=''):
    return error('会话校验已失效，请刷新页面后重试。', 403)


@require_http_methods(['GET'])
def health(request):
    return response({'service': 'zhixu', 'version': '1.1'})


def body(request):
    try:
        data = json.loads(request.body or b'{}')
        if not isinstance(data, dict):
            raise ValueError
        return data
    except (ValueError, UnicodeDecodeError):
        raise ValidationError('请求内容格式不正确。')


def endpoint(methods, student=True):
    def decorate(fn):
        @wraps(fn)
        @require_http_methods(methods)
        def wrapped(request, *args, **kwargs):
            if student and not request.user.is_authenticated:
                return error('请先登录。', 401)
            if student and (request.user.is_staff or request.user.is_superuser):
                return error('此入口仅供学生使用。', 403)
            try:
                return fn(request, *args, **kwargs)
            except ValidationError as exc:
                return error('；'.join(exc.messages))
        return wrapped
    return decorate


def profile(user):
    return {'id': user.pk, 'username': user.username, 'name': user.first_name or user.username, 'role': 'student'}


@ensure_csrf_cookie
@never_cache
def index(request):
    return FileResponse((settings.BASE_DIR / 'frontend' / 'index.html').open('rb'), content_type='text/html; charset=utf-8')


def static_file(request, path):
    return serve(request, path, document_root=settings.BASE_DIR / 'frontend', show_indexes=False)


@ensure_csrf_cookie
@never_cache
@endpoint(['GET'], student=False)
def session(request):
    user = request.user
    return response({'user': profile(user) if user.is_authenticated and not user.is_staff and not user.is_superuser else None})


@endpoint(['POST'], student=False)
def register(request):
    data = body(request)
    username = str(data.get('username', '')).strip().lower()
    password = str(data.get('password', ''))
    name = str(data.get('name', '')).strip()
    if not re.fullmatch(r'[a-z0-9_]{3,20}', username):
        return error('用户名须为 3—20 位字母、数字或下划线。')
    if not 8 <= len(password) <= 64:
        return error('密码长度须为 8—64 位。')
    if data.get('password_confirm') != password:
        return error('两次输入的密码不一致。')
    if len(name) > 24:
        return error('称呼最多 24 个字。')
    if data.get('role', 'student') != 'student':
        return error('仅支持学生账号。')
    User = get_user_model()
    if User.objects.filter(username=username).exists():
        return error('这个用户名已被使用。', 409)
    user = User(username=username, first_name=name)
    validate_password(password, user)
    try:
        with transaction.atomic():
            user.set_password(password)
            user.save()
    except IntegrityError:
        return error('这个用户名已被使用。', 409)
    auth_login(request, user)
    return response({'user': profile(user)}, 201)


@endpoint(['POST'], student=False)
def login(request):
    data = body(request)
    username = str(data.get('username', '')).strip().lower()
    password = str(data.get('password', ''))
    if len(username) > 20 or len(password) > 64:
        return error('用户名或密码不正确。', 401)
    user = authenticate(request, username=username, password=password)
    if user is None or user.is_staff or user.is_superuser:
        return error('用户名或密码不正确。', 401)
    auth_login(request, user)
    return response({'user': profile(user)})


@endpoint(['POST'])
def logout(request):
    auth_logout(request)
    return response({'ok': True})


def unit_brief(unit, read_ids=()):
    return {'id': unit.slug, 'title': unit.title, 'knowledge_code': unit.knowledge_code, 'summary': unit.summary, 'question_count': 5, 'read': unit.slug in read_ids, 'figure': unit.content.get('figure', 'prism')}


@endpoint(['GET'])
def units(request):
    read_ids = set(UnitProgress.objects.filter(user=request.user).values_list('unit_id', flat=True))
    return response({'units': [unit_brief(u, read_ids) for u in Unit.objects.all()]})


@endpoint(['GET', 'POST'])
def unit_detail(request, slug):
    unit = get_object_or_404(Unit, pk=slug)
    if request.method == 'POST':
        UnitProgress.objects.get_or_create(user=request.user, unit=unit)
        return response({'read': True})
    data = unit_brief(unit, set(UnitProgress.objects.filter(user=request.user, unit=unit).values_list('unit_id', flat=True)))
    return response({'unit': {**data, **unit.content}})


def public_question(q):
    return {k: v for k, v in q.items() if k not in ['answer', 'explanation', 'tolerance']}


def practice_data(p, detail=False):
    data = {'id': str(p.id), 'unit_id': p.unit_id, 'unit_title': p.unit.title, 'mode': p.mode, 'total': len(p.questions), 'correct': p.correct_count, 'started_at': p.started_at.isoformat(), 'submitted_at': p.submitted_at.isoformat() if p.submitted_at else None, 'source_id': str(p.source_id) if p.source_id else None}
    if detail:
        data.update({'questions': [public_question(q) for q in p.questions], 'answers': p.answers, 'result': p.result if p.submitted_at else []})
    return data


@endpoint(['POST'])
def create_practice(request):
    data = body(request)
    mode = data.get('mode', 'fixed')
    source = None
    if mode == 'fixed':
        unit = get_object_or_404(Unit, pk=str(data.get('unit_id', '')))
        questions = list(Question.objects.filter(unit=unit).values_list('payload', flat=True))
        if len(questions) != 5:
            return error('当前单元题目尚未准备完整。', 503)
    elif mode == 'retry_wrong':
        source = get_object_or_404(Practice.objects.select_related('unit'), pk=data.get('source_id'), user=request.user, submitted_at__isnull=False)
        ids = {r['id'] for r in source.result if not r['correct']}
        questions = [q for q in source.questions if q['id'] in ids]
        unit = source.unit
        if not questions:
            return error('本次练习没有需要重练的错题。')
    else:
        return error('不支持的练习类型。')
    p = Practice.objects.create(user=request.user, unit=unit, mode=mode, source=source, questions=questions)
    return response({'practice': practice_data(p, True)}, 201)


@endpoint(['GET'])
def get_practice(request, practice_id):
    p = get_object_or_404(Practice.objects.select_related('unit'), pk=practice_id, user=request.user)
    return response({'practice': practice_data(p, True)})


def grade(q, answer):
    if not answer.strip():
        return False
    if q['type'] == 'choice':
        return answer == q['answer']
    try:
        value = Decimal(answer.strip())
        return value.is_finite() and abs(value - Decimal(str(q['answer']))) <= Decimal(str(q.get('tolerance', '0.01')))
    except (DecimalException, ValueError):
        return False


@endpoint(['POST'])
def submit_practice(request, practice_id):
    p = get_object_or_404(Practice.objects.select_related('unit'), pk=practice_id, user=request.user)
    if p.submitted_at:
        return response({'practice': practice_data(p, True), 'already_submitted': True})
    answers = body(request).get('answers', {})
    ids = {q['id'] for q in p.questions}
    if not isinstance(answers, dict) or set(answers) - ids or any(not isinstance(a, str) or len(a) > 100 for a in answers.values()):
        return error('作答格式不正确，请刷新题目后重试。')
    normalized = {q['id']: answers.get(q['id'], '').strip() for q in p.questions}
    result = [{'id': q['id'], 'submitted_answer': normalized[q['id']], 'correct': grade(q, normalized[q['id']]), 'answer': str(q['answer']), 'explanation': q['explanation']} for q in p.questions]
    with transaction.atomic():
        updated = Practice.objects.filter(pk=p.pk, user=request.user, submitted_at__isnull=True).update(answers=normalized, result=result, correct_count=sum(r['correct'] for r in result), submitted_at=timezone.now())
    p.refresh_from_db()
    return response({'practice': practice_data(p, True), 'already_submitted': not bool(updated)})


@endpoint(['GET'])
def history(request):
    items = Practice.objects.select_related('unit').filter(user=request.user, submitted_at__isnull=False)
    if request.GET.get('unit'):
        items = items.filter(unit_id=request.GET['unit'])
    data = [practice_data(p) for p in items]
    if request.GET.get('wrong') == '1':
        data = [p for p in data if p['correct'] < p['total']]
    return response({'history': data})


@endpoint(['GET'])
def dashboard(request):
    all_practices = Practice.objects.select_related('unit').filter(user=request.user)
    completed = list(all_practices.filter(submitted_at__isnull=False))
    pending = all_practices.filter(submitted_at__isnull=True).first()
    return response({'completed': len(completed), 'answered': sum(len(p.questions) for p in completed), 'correct': sum(p.correct_count for p in completed), 'read_units': UnitProgress.objects.filter(user=request.user).count(), 'recent': [practice_data(p) for p in completed[:3]], 'pending': practice_data(pending) if pending else None, 'materials': 3 + Material.objects.filter(user=request.user).count()})


def material_catalog():
    return json.loads((settings.BASE_DIR / 'catalog' / 'materials.json').read_text(encoding='utf-8'))


def material_data(m):
    return {'id': str(m.pk), 'title': m.title, 'kind': 'question', 'typeLabel': '我的题目', 'collection': m.collection, 'tags': m.parsed['tags'], 'summary': '三棱柱题目、已知条件、讲解与交互模型。', 'createdAt': m.created_at.isoformat(), 'source': '我的题图资料', 'note': m.note, 'parsed': m.parsed}


@endpoint(['GET', 'POST'])
def materials(request):
    catalog = material_catalog()
    if request.method == 'GET':
        return response({'materials': [material_data(m) for m in Material.objects.filter(user=request.user)] + catalog['materials']})
    data = body(request)
    if data.get('sample_id') != catalog['example']['id']:
        return error('请先选择支持的样例题图。')
    title = str(data.get('title', '')).strip()
    note = str(data.get('note', '')).strip()
    collection = data.get('collection', '立体几何')
    if not title or len(title) > 80 or len(note) > 300:
        return error('请填写 1—80 字的标题，备注最多 300 字。')
    if collection not in ['立体几何', '我的题目'] or data.get('confirmed') is not True:
        return error('请核对条件并选择资料分类。')
    m, created = Material.objects.get_or_create(user=request.user, sample_id=catalog['example']['id'], defaults={'title': title, 'collection': collection, 'note': note, 'parsed': catalog['example']['parsed']})
    return response({'material': material_data(m), 'duplicate': not created}, 201 if created else 200)


@endpoint(['GET'])
def sample_question(request):
    return response({'sample': material_catalog()['example']})


@endpoint(['GET'])
def get_material(request, material_id):
    for m in material_catalog()['materials']:
        if m['id'] == material_id:
            return response({'material': m})
    try:
        m = Material.objects.get(pk=material_id, user=request.user)
    except (Material.DoesNotExist, ValidationError):
        return error('未找到这份资料。', 404)
    return response({'material': material_data(m)})
