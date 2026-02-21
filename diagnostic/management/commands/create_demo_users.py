from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from diagnostic.models import UserProfile


class Command(BaseCommand):
    help = "Create demo users: physician (physician/physician123), nurse (nurse/nurse123), emt (emt/emt123)."

    def handle(self, *args, **options):
        for username, password, role in [
            ("physician", "physician123", "physician"),
            ("nurse", "nurse123", "nurse"),
            ("emt", "emt123", "emt"),
        ]:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@demo.local"},
            )
            if created:
                user.set_password(password)
                user.save()
                self.stdout.write(f"Created user: {username}")
            UserProfile.objects.get_or_create(user=user, defaults={"role": role})
        self.stdout.write(self.style.SUCCESS("Demo users ready. Log in with physician/physician123, nurse/nurse123, or emt/emt123."))
