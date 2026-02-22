from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from diagnostic.models import UserProfile


class Command(BaseCommand):
    help = "Create demo users: patients Amira Godar, John Doe, Greg Yoas; physician Richard Smith; and patient/physician/nurse/emt demos."

    def handle(self, *args, **options):
        for username, password, role in [
            ("patient", "patient123", "patient"),
            ("physician", "physician123", "physician"),
            ("nurse", "nurse123", "nurse"),
            ("emt", "emt123", "emt"),
            ("Richard Smith", "Richard@123", "physician"),
            ("Amira Godar", "Amira@123", "patient"),
            ("John Doe", "John@123", "patient"),
            ("Greg Yoas", "Greg@123", "patient"),
        ]:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username.replace(' ', '_')}@demo.local"},
            )
            if created:
                user.set_password(password)
                user.save()
                self.stdout.write(f"Created user: {username}")
            profile, created_profile = UserProfile.objects.get_or_create(user=user, defaults={"role": role})
            if not created_profile and profile.role != role:
                profile.role = role
                profile.save()
        self.stdout.write(self.style.SUCCESS(
            "Demo users ready. Patients: Amira Godar (Amira@123), John Doe (John@123), Greg Yoas (Greg@123) -> patient dashboard. "
            "Physicians: physician/physician123, Richard Smith/Richard@123."
        ))
