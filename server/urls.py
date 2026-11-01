from django.urls import path
from learning import views as v

urlpatterns = [
    path('', v.index),
    path('api/session', v.session),
    path('api/health', v.health),
    path('api/register', v.register),
    path('api/login', v.login),
    path('api/logout', v.logout),
    path('api/units', v.units),
    path('api/units/<slug:slug>', v.unit_detail),
    path('api/dashboard', v.dashboard),
    path('api/practices', v.create_practice),
    path('api/practices/<uuid:practice_id>', v.get_practice),
    path('api/practices/<uuid:practice_id>/submit', v.submit_practice),
    path('api/history', v.history),
    path('api/materials', v.materials),
    path('api/materials/<str:material_id>', v.get_material),
    path('api/sample-question', v.sample_question),
    path('static/<path:path>', v.static_file),
]
