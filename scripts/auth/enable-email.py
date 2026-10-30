#!/usr/bin/env python3
"""
Points the self-hosted auth service at a real mail server and turns on email confirmation (sign-up codes).

  python3 scripts/auth/enable-email.py --pass-file /root/no-reply.pass

The mailbox password is read from a file (never from the command line) and written only into the compose file's
auth service. A timestamped backup of the compose file is made first. Afterwards restart only the auth service:

  cd /root/vps-migration/app-compose-secret && docker compose -f operix.json -f ../supabase-compose.SECRET.json -p operix up -d --no-deps auth
"""
import argparse, json, os, shutil, stat, sys, time

parser = argparse.ArgumentParser()
parser.add_argument('--compose', default='/root/vps-migration/supabase-compose.SECRET.json')
parser.add_argument('--host', default='mail.operixsuite.com')
parser.add_argument('--port', default='587')
parser.add_argument('--user', default='no-reply@operixsuite.com')
parser.add_argument('--sender-name', default='OperiX')
parser.add_argument('--pass-file', required=True)
parser.add_argument('--public-url', default='https://invoice.operixsuite.com')
parser.add_argument('--template-base', default='http://operix-operix-web-1:3000')
args = parser.parse_args()

mode = os.stat(args.pass_file).st_mode
if mode & (stat.S_IRWXG | stat.S_IRWXO):
    sys.exit(f'{args.pass_file} is readable by other users. Run: chmod 600 {args.pass_file}')
password = open(args.pass_file).read().strip()
if not password:
    sys.exit('The password file is empty.')

backup = f"{args.compose}.bak-{time.strftime('%Y%m%d-%H%M%S')}-email"
shutil.copy2(args.compose, backup)
data = json.load(open(args.compose))
env = data['services']['auth']['environment']
base = args.public_url.rstrip('/')
verify = f'{base}/supabase/auth/v1/verify'
wanted = {
    'GOTRUE_SMTP_HOST': args.host,
    'GOTRUE_SMTP_PORT': str(args.port),
    'GOTRUE_SMTP_USER': args.user,
    'GOTRUE_SMTP_PASS': password,
    'GOTRUE_SMTP_ADMIN_EMAIL': args.user,
    'GOTRUE_SMTP_SENDER_NAME': args.sender_name,
    'GOTRUE_MAILER_AUTOCONFIRM': 'false',
    'API_EXTERNAL_URL': f'{base}/supabase/auth/v1',
    'GOTRUE_MAILER_URLPATHS_CONFIRMATION': verify,
    'GOTRUE_MAILER_URLPATHS_RECOVERY': verify,
    'GOTRUE_MAILER_URLPATHS_INVITE': verify,
    'GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE': verify,
    'GOTRUE_MAILER_TEMPLATES_CONFIRMATION': f'{args.template_base.rstrip("/")}/email-templates/confirmation.html',
    'GOTRUE_MAILER_SUBJECTS_CONFIRMATION': 'Your OperiX verification code',
}
index = {entry.split('=', 1)[0]: i for i, entry in enumerate(env)}
for key, value in wanted.items():
    line = f'{key}={value}'
    if key in index: env[index[key]] = line
    else: env.append(line)
json.dump(data, open(args.compose, 'w'), indent=2)
print(f'Updated {len(wanted)} settings. Backup: {backup}')
print('Mail server:', args.host, args.port, 'as', args.user, '(password not shown)')
