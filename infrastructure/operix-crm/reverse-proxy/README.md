# Reverse proxy change for `crm.operixsuite.com`

No proxy configuration is checked into this repository. Merge the equivalent
small, reviewed block into the existing host proxy; do not replace its global
configuration. The proxy must terminate HTTPS, forward WebSocket upgrades, and
keep port 3020 private.

Example Nginx location:

```nginx
server {
    server_name crm.operixsuite.com;

    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Obtain and validate the certificate using the existing proxy convention. Run
`nginx -t` (or the equivalent for the current proxy) before reload. Twenty's
`SERVER_URL` must remain `https://crm.operixsuite.com`.
