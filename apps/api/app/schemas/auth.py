from pydantic import BaseModel, EmailStr, field_validator
import re


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    organization_name: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "name":              "João Silva",
                "email":             "joao@empresa.com.br",
                "password":          "SenhaForte123!",
                "organization_name": "Rede Eletropostos SP",
            }
        }
    }

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Senha deve ter pelo menos 8 caracteres")
        return v

    @field_validator("name", "organization_name")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Campo obrigatório")
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "email":    "joao@empresa.com.br",
                "password": "SenhaForte123!",
            }
        }
    }


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

    model_config = {
        "json_schema_extra": {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type":   "bearer",
            }
        }
    }


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    model_config = {
        "json_schema_extra": {"example": {"email": "joao@empresa.com.br"}}
    }


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    model_config = {
        "json_schema_extra": {
            "example": {
                "token":        "eyJhbGciOiJIUzI1NiJ9...",
                "new_password": "NovaSenhaForte456!",
            }
        }
    }

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Senha deve ter pelo menos 8 caracteres")
        return v


class VerifyEmailRequest(BaseModel):
    token: str

    model_config = {
        "json_schema_extra": {"example": {"token": "eyJhbGciOiJIUzI1NiJ9..."}}
    }


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    organization_id: str
    organization_name: str
    email_verified: bool
    is_master: bool = False
    custom_role_id: str | None = None
    custom_role_name: str | None = None
    permissions: dict[str, bool] = {}

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id":                "550e8400-e29b-41d4-a716-446655440000",
                "email":             "joao@empresa.com.br",
                "name":              "João Silva",
                "role":              "owner",
                "organization_id":   "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                "organization_name": "Rede Eletropostos SP",
                "email_verified":    True,
                "custom_role_id":    None,
                "custom_role_name":  None,
                "permissions": {
                    "view_dashboard": True,
                    "import_files":   True,
                    "manage_team":    True,
                },
            }
        },
    }


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    current_password: str | None = None
    new_password: str | None = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "name":             "João A. Silva",
                "current_password": "SenhaAtual123!",
                "new_password":     "NovaSenha456!",
            }
        }
    }
