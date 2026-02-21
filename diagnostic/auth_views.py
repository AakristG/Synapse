import logging

from django.conf import settings
from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserProfile

logger = logging.getLogger(__name__)


def _user_response(user):
    profile = getattr(user, "profile", None)
    role = profile.role if profile else "physician"
    return {
        "id": user.id,
        "username": user.username,
        "role": role,
    }


@api_view(["POST"])
def login(request):
    """POST { username, password } -> { access, refresh, user: { id, username, role } }"""
    try:
        data = getattr(request, "data", None) or {}
        if not isinstance(data, dict):
            data = {}
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        if not username or not password:
            return Response(
                {"detail": "Username and password required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = authenticate(request, username=username, password=password)
        if not user:
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        profile, _ = UserProfile.objects.get_or_create(user=user, defaults={"role": "physician"})
        refresh = RefreshToken.for_user(user)
        user_dict = {
            "id": user.id,
            "username": user.username,
            "role": profile.role,
        }
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": user_dict,
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.exception("Login failed")
        detail = str(e) if settings.DEBUG else "Server error during login."
        return Response(
            {"detail": detail},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """GET -> current user { id, username, role }"""
    return Response(_user_response(request.user))
