export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function emailDomainHint() {
  return 'name@example.com';
}

export function emailValidationError(email) {
  if (!email.trim()) return 'Email is required';
  if (!isAllowedEmail(email)) {
    return 'Enter a valid email address';
  }
  return '';
}
