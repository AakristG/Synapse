from django.contrib import admin
from .models import UserProfile, Conversation, Transcript, ClinicalNote, PatientSummary, EMRExport

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')

@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('session_id', 'source', 'language', 'created_at')

@admin.register(Transcript)
class TranscriptAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'role', 'created_at')
    list_filter = ('role',)

@admin.register(ClinicalNote)
class ClinicalNoteAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'created_at')

@admin.register(PatientSummary)
class PatientSummaryAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'created_at')

@admin.register(EMRExport)
class EMRExportAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'external_system', 'status', 'created_at')
