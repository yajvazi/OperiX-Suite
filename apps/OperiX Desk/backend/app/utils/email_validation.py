def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_allowed_email(email: str) -> str:
    return normalize_email(email)
