from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views, auth_views

urlpatterns = [
    path('auth/login/', auth_views.login),
    path('auth/refresh/', TokenRefreshView.as_view()),
    path('auth/me/', auth_views.me),
    path('audio/extract/', views.audio_extract),
    path('intake-from-text/', views.intake_from_text_api),
    path('conversations/', views.conversation_list),
    path('conversations/<int:pk>/', views.conversation_detail),
    path('conversations/<int:pk>/transcripts/', views.add_transcript),
    path('conversations/<int:pk>/transcribe/', views.transcribe),
    path('conversations/<int:pk>/summarize/', views.summarize),
    path('conversations/<int:pk>/export-emr/', views.export_emr),
    path('clinical/plan-for-diagnosis/', views.clinical_plan_for_diagnosis),
    path('clinical/translate-document/', views.translate_document_api),
    # ER Triage — commented out
    # path('triage/encounters/', views.triage_encounter_list_create),
    # path('triage/encounters/<int:pk>/', views.triage_encounter_detail),
    # path('triage/encounters/<int:pk>/score/', views.triage_score),
    # path('triage/encounters/<int:pk>/finalize/', views.triage_finalize),
    # path('triage/encounters/<int:pk>/document/', views.triage_document),
]
