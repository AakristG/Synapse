from django.urls import path
from . import views, auth_views

urlpatterns = [
    path('auth/login/', auth_views.login),
    path('auth/me/', auth_views.me),
    path('audio/extract/', views.audio_extract),
    path('conversations/', views.conversation_list),
    path('conversations/<int:pk>/', views.conversation_detail),
    path('conversations/<int:pk>/transcripts/', views.add_transcript),
    path('conversations/<int:pk>/transcribe/', views.transcribe),
    path('conversations/<int:pk>/summarize/', views.summarize),
    path('conversations/<int:pk>/export-emr/', views.export_emr),
]
