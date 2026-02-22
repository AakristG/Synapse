from django.urls import path
from . import views, auth_views

urlpatterns = [
    path('auth/login/', auth_views.login),
    path('auth/me/', auth_views.me),
    path('audio/extract/', views.audio_extract),
    path('recorded-patients/', views.recorded_patients_list),
    path('recorded-patients/create/', views.recorded_patients_create),
    path('recorded-patients/<str:external_id>/', views.recorded_patient_detail),
    path('voice/incoming/', views.twilio_voice_incoming),
    path('voice/recording-callback/', views.twilio_recording_callback),
    path('conversations/', views.conversation_list),
    path('conversations/<int:pk>/', views.conversation_detail),
    path('conversations/<int:pk>/transcripts/', views.add_transcript),
    path('conversations/<int:pk>/transcribe/', views.transcribe),
    path('conversations/<int:pk>/summarize/', views.summarize),
    path('conversations/<int:pk>/export-emr/', views.export_emr),
    path('clinical/plan-for-diagnosis/', views.clinical_plan_for_diagnosis),
]
