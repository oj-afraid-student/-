import uuid
from django.conf import settings
from django.db import models


class Unit(models.Model):
    slug = models.SlugField(primary_key=True)
    title = models.CharField(max_length=100)
    knowledge_code = models.CharField(max_length=10)
    summary = models.TextField()
    position = models.PositiveIntegerField(default=0)
    content = models.JSONField(default=dict)

    class Meta:
        ordering = ['position']


class Question(models.Model):
    code = models.CharField(max_length=30, primary_key=True)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT)
    position = models.PositiveIntegerField()
    payload = models.JSONField()

    class Meta:
        ordering = ['position']
        constraints = [models.UniqueConstraint(fields=['unit', 'position'], name='unique_unit_question_position')]


class UnitProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'unit'], name='unique_student_unit_progress')]


class Practice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT)
    mode = models.CharField(max_length=20, default='fixed')
    source = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL)
    questions = models.JSONField(default=list)
    answers = models.JSONField(default=dict)
    result = models.JSONField(default=list)
    correct_count = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']


class Material(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    sample_id = models.CharField(max_length=40)
    title = models.CharField(max_length=80)
    collection = models.CharField(max_length=30, default='立体几何')
    note = models.CharField(max_length=300, blank=True)
    parsed = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['user', 'sample_id'], name='unique_student_material_sample')]
