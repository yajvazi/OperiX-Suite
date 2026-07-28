from app.config import settings


def api_url(path: str) -> str:
    if settings.api_base_url:
        return f"{settings.api_base_url.rstrip('/')}{path}"
    return path
