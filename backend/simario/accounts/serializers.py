from rest_framework import serializers


class LoginSerializer(serializers.Serializer[None]):
    nip = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


class SignInResultSerializer(serializers.Serializer[None]):
    ok = serializers.BooleanField()
    user_id = serializers.UUIDField()


class PasswordSerializer(serializers.Serializer[None]):
    old_password = serializers.CharField(required=False, trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)


class AuthConfigSerializer(serializers.Serializer[None]):
    dev_tools = serializers.BooleanField()
    oidc_enabled = serializers.BooleanField()
