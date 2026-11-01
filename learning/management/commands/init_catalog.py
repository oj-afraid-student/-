import json
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from learning.models import Unit, Question


class Command(BaseCommand):
    help = '初始化学习单元与固定题目，不创建用户或改写历史答卷。'

    @transaction.atomic
    def handle(self, *args, **options):
        catalog = json.loads((settings.BASE_DIR / 'catalog' / 'units.json').read_text(encoding='utf-8'))
        for entry in catalog:
            unit, _ = Unit.objects.update_or_create(slug=entry['slug'], defaults={k: entry[k] for k in ['title', 'knowledge_code', 'summary', 'position', 'content']})
            if len(entry['questions']) != 5:
                raise ValueError('每个单元必须包含固定五题')
            for position, question in enumerate(entry['questions'], 1):
                Question.objects.update_or_create(code=question['id'], defaults={'unit': unit, 'position': position, 'payload': question})
        self.stdout.write(self.style.SUCCESS(f'已准备 {len(catalog)} 个学习单元及 {len(catalog)*5} 道题。'))
