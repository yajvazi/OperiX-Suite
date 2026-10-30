# Security policy

Please report suspected vulnerabilities privately through GitHub's **Security → Report a vulnerability**
(private advisory) on this repository. Do not open a public issue.

Include what you found, steps to reproduce, and the affected version or commit. We aim to acknowledge reports
within 5 working days and will keep you informed while we fix it. Please give us a reasonable time to release a fix
before you disclose details.

Operators: never commit `.env` files, the Supabase `service_role` key, Stripe secret keys or webhook secrets.
If one leaks, rotate it immediately.
