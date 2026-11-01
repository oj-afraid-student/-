import json
from pathlib import Path
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.conf import settings
from learning.models import Unit, Question, Practice, Material


class WorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('init_catalog', verbosity=0)
        cls.student = get_user_model().objects.create_user('student_a', password='StudyGeo2026!')
        cls.other = get_user_model().objects.create_user('student_b', password='OtherGeo2026!')

    def setUp(self):
        self.client.force_login(self.student)

    def post(self, url, data=None, client=None):
        return (client or self.client).post('/api/' + url, data=json.dumps(data or {}), content_type='application/json')

    def create(self, unit='prism-section'):
        result = self.post('practices', {'unit_id': unit})
        self.assertEqual(result.status_code, 201)
        return result.json()['practice']

    def submit(self, practice, answers):
        result = self.post('practices/' + practice['id'] + '/submit', {'answers': answers})
        self.assertEqual(result.status_code, 200)
        return result.json()['practice']

    def test_register_login_logout_and_password_hash(self):
        c = Client()
        data = {'username': 'new_student', 'name': '林同学', 'password': 'SolidGeo2026!', 'password_confirm': 'SolidGeo2026!'}
        result = self.post('register', data, c)
        self.assertEqual(result.status_code, 201)
        user = get_user_model().objects.get(username='new_student')
        self.assertNotEqual(user.password, data['password'])
        self.assertTrue(user.check_password(data['password']))
        self.assertFalse(user.is_staff)
        self.assertEqual(result.json()['user']['role'], 'student')
        self.assertEqual(self.post('logout', client=c).status_code, 200)
        self.assertEqual(c.get('/api/history').status_code, 401)
        self.assertEqual(self.post('login', {'username': 'NEW_STUDENT', 'password': data['password']}, c).status_code, 200)
        self.assertEqual(self.post('login', {'username': 'new_student', 'password': 'wrong'}, Client()).status_code, 401)

    def test_registration_validation_and_student_only(self):
        base = {'username': 'available', 'password': 'SolidGeo2026!', 'password_confirm': 'SolidGeo2026!'}
        for patch in [{'role': 'teacher'}, {'username': 'ab'}, {'password_confirm': 'different'}, {'password': '12345678', 'password_confirm': '12345678'}]:
            self.assertEqual(self.post('register', {**base, **patch}, Client()).status_code, 400)
        self.assertEqual(self.post('register', {**base, 'username': 'STUDENT_A'}, Client()).status_code, 409)
        staff = get_user_model().objects.create_user('staff', password='SolidGeo2026!', is_staff=True)
        c = Client(); c.force_login(staff)
        self.assertEqual(c.get('/api/units').status_code, 403)

    def test_csrf_is_enforced_and_rotates_on_login(self):
        c = Client(enforce_csrf_checks=True)
        c.get('/api/session')
        token = c.cookies['csrftoken'].value
        data = json.dumps({'username': 'student_a', 'password': 'StudyGeo2026!'})
        self.assertEqual(c.post('/api/login', data, content_type='application/json').status_code, 403)
        self.assertEqual(c.post('/api/login', data, content_type='application/json', HTTP_X_CSRFTOKEN=token).status_code, 200)
        new_token = c.cookies['csrftoken'].value
        self.assertNotEqual(token, new_token)
        self.assertEqual(c.post('/api/logout', '{}', content_type='application/json', HTTP_X_CSRFTOKEN=new_token).status_code, 200)

    def test_units_have_content_and_exactly_five_questions(self):
        units = self.client.get('/api/units').json()['units']
        self.assertEqual(len(units), 3)
        self.assertEqual(Question.objects.count(), 15)
        for unit in units:
            content = self.client.get('/api/units/' + unit['id']).json()['unit']
            for key in ['concepts', 'theorems', 'figure', 'examples']:
                self.assertTrue(content[key])
            self.assertTrue(all(t['conditions'] and t['conclusion'] for t in content['theorems']))
            practice = self.create(unit['id'])
            self.assertEqual(len(practice['questions']), 5)
            self.assertTrue(all('answer' not in q and 'explanation' not in q for q in practice['questions']))
        self.post('units/space-lines');self.post('units/space-lines')
        self.assertEqual(self.client.get('/api/dashboard').json()['read_units'], 1)

    def test_server_grading_and_repeat_submission_are_immutable(self):
        practice = self.create()
        answers = {'G03-01': '3', 'G03-02': '0', 'G03-03': 'B', 'G03-04': '90', 'G03-05': 'A'}
        result = self.post('practices/' + practice['id'] + '/submit', {'answers': answers, 'correct': 999, 'result': [{'correct': True}]})
        self.assertEqual(result.json()['practice']['correct'], 3)
        self.assertEqual(len(result.json()['practice']['result']), 5)
        self.assertTrue(all(r['explanation'] for r in result.json()['practice']['result']))
        first = result.json()['practice']
        second = self.submit(practice, {q['id']: 'anything' for q in practice['questions']})
        self.assertEqual(first, second)
        self.assertEqual(Practice.objects.filter(user=self.student, submitted_at__isnull=False).count(), 1)
        self.assertEqual(self.client.get('/api/history').json()['history'][0]['correct'], 3)

    def test_answer_snapshot_survives_catalog_edits(self):
        p = self.create()
        q = Question.objects.get(pk='G03-01');q.payload['answer'] = '99';q.save()
        result = self.submit(p, {'G03-01': '3', 'G03-02': '4', 'G03-03': 'B', 'G03-04': '90', 'G03-05': 'C'})
        self.assertEqual(result['correct'], 5)
        self.assertEqual(result['result'][0]['answer'], '3')

    def test_practice_ownership(self):
        p = self.create(); self.submit(p, {})
        self.client.force_login(self.other)
        self.assertEqual(self.client.get('/api/history').json()['history'], [])
        self.assertEqual(self.client.get('/api/practices/' + p['id']).status_code, 404)
        self.assertEqual(self.post('practices/' + p['id'] + '/submit', {'answers': {}}).status_code, 404)
        self.assertEqual(self.post('practices', {'mode': 'retry_wrong', 'source_id': p['id']}).status_code, 404)

    def test_invalid_answers_and_extreme_numbers(self):
        p = self.create()
        for answers in [[], {'bad-id': 'A'}, {'G03-01': True}, {'G03-01': 'x'*101}]:
            self.assertEqual(self.post('practices/' + p['id'] + '/submit', {'answers': answers}).status_code, 400)
        result = self.submit(p, {'G03-01': 'NaN', 'G03-02': '1e999999999', 'G03-04': 'Infinity'})
        self.assertEqual(result['correct'], 0)

    def test_wrong_filter_and_retry_without_changing_old_record(self):
        p = self.create()
        self.submit(p, {'G03-01': '3', 'G03-02': '0', 'G03-03': 'B', 'G03-04': '90', 'G03-05': 'A'})
        retry = self.post('practices', {'mode': 'retry_wrong', 'source_id': p['id']}).json()['practice']
        self.assertEqual([q['id'] for q in retry['questions']], ['G03-02', 'G03-05'])
        self.assertEqual(retry['total'], 2)
        self.submit(retry, {'G03-02': '4', 'G03-05': 'C'})
        filtered = self.client.get('/api/history?wrong=1').json()['history']
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]['id'], p['id'])
        self.assertEqual(self.client.get('/api/practices/' + p['id']).json()['practice']['correct'], 3)
        self.assertEqual(self.post('practices', {'mode': 'retry_wrong', 'source_id': retry['id']}).status_code, 400)

    def test_material_import_and_personal_ownership(self):
        data = {'sample_id': 'EX-PRISM-001', 'title': '我的三棱柱题', 'collection': '立体几何', 'note': '找到正方形截面', 'confirmed': False}
        self.assertEqual(self.post('materials', data).status_code, 400)
        data['confirmed'] = True
        first = self.post('materials', data)
        self.assertEqual(first.status_code, 201)
        material = first.json()['material']
        duplicate = self.post('materials', {**data, 'title': '不应覆盖的标题'})
        self.assertEqual(duplicate.status_code, 200)
        self.assertTrue(duplicate.json()['duplicate'])
        self.assertEqual(duplicate.json()['material']['title'], data['title'])
        self.assertEqual(len(self.client.get('/api/materials').json()['materials']), 4)
        self.client.force_login(self.other)
        self.assertEqual(len(self.client.get('/api/materials').json()['materials']), 3)
        self.assertEqual(self.client.get('/api/materials/' + material['id']).status_code, 404)
        self.assertEqual(self.post('materials', data).status_code, 201)
        self.assertEqual(Material.objects.count(), 2)

    def test_private_catalog_not_served_as_static_and_ui_wording(self):
        self.assertIn(self.client.get('/static/../catalog/units.json').status_code, [400, 404])
        forbidden = '\u5c55\u793a'
        for p in (settings.BASE_DIR/'frontend').rglob('*'):
            if p.suffix in ['.js', '.html', '.css', '.svg']:
                self.assertNotIn(forbidden, p.read_text(encoding='utf-8'), str(p))
