# The Social Studio

**Internal social publishing tool by Hyper Studio.** Plan, compose, schedule and measure organic posts across Instagram, Facebook Pages, Threads, TikTok and LinkedIn — from one workspace.

No ads. No campaigns. Social only — that's the point of it being its own product.

The Social Studio is a private workspace tool. There is no public signup — users are created by a workspace admin. The current version supports a single workspace per install; teams come later.

## Relationship to Vass (the ads app)

The Social Studio began as the `/organic` section of [Vass](https://github.com/petaronline/vass), Hyper Studio's Meta ad launcher, and was split out into its own product. The two are now **fully independent**: separate repo, separate database, separate Redis, separate containers, separate domain, separate session cookie. Neither app reads the other's tables and neither can take the other down.

What they still have in common is by copy, not by connection:

| Shared thing | How it's shared |
|---|---|
| Meta App (App ID + Secret) | **Same credentials, entered separately in each app.** Tokens are app-scoped — reusing the App ID means every already-connected Page/IG account keeps working with no reconnect and no new App Review. Add this app's OAuth redirect URI to the existing Meta App. |
| Users | Duplicated. A person who needs both apps has an account in each. Bcrypt hashes port across directly if you seed from a `users` dump. |
| Brands | Duplicated. Ads groups ad accounts under brands; Organic groups social profiles under brands. They drift independently. |
| Platform code | Forked at commit `76046f5`. Bug fixes to shared plumbing (auth, uploads, brands, notifications) have to be applied twice. |

**Comment Guard stayed in the ads app.** It is ads-scoped — campaigns, ad sets, ads — and only ever borrowed Organic's Page tokens to hide comments. Rather than drag `ad_accounts` and the campaign explorers into Organic, the ads app now requests its own `pages_show_list` / `pages_read_engagement` / `pages_manage_engagement` scopes. Those permissions are already approved on the Meta App, so the only user-visible cost was a one-time re-consent on the ads side.

## What's in this install bundle

- `install.sh` — first-time install script. Generates secrets, builds containers, runs migrations, prompts for the first admin.
- `scripts/install-patch.sh` — applies a numbered patch zip on top of an existing install.
- `deploy.sh` — build + verify + package + upload from a dev machine; prints the one root command to finish.
- `docker-compose.yml` — service orchestration (Postgres, Redis, backend, frontend).
- `backend/` — TypeScript Express API + publish/sync workers.
- `frontend/` — Next.js 15 app.
- `docs/` — deeper guides (Meta App setup, Apache proxy, troubleshooting).

## Stack

| Layer    | Tech                                              |
|----------|---------------------------------------------------|
| Frontend | Next.js 15 (App Router), React 18, Tailwind       |
| Backend  | Node 20, TypeScript, Express                      |
| Workers  | BullMQ on Redis (organic-publish, meta-sync)      |
| Database | Postgres 16                                       |
| Auth     | Server-side sessions, bcrypt passwords            |
| Meta     | Workspace-wide Meta App, per-user OAuth tokens    |
| Deploy   | Docker Compose                                    |

## What it does

- **Studio** — compose a post once, target many profiles, per-target media and copy overrides, live platform previews.
- **Pipeline** — the board of everything in flight, by status.
- **Drafts** / **Ideas** — Notion-style scratch space, brand-scoped, with folders.
- **Scheduled / Calendar** — queue posts for a time; BullMQ publishes them.
- **Analytics** — hourly sync of published posts + insights from Meta and Threads.
- **Accounts** — connect Facebook Pages, Instagram Business, Threads, TikTok, LinkedIn (personal + organization).

## Prerequisites

A Linux server with:

- **Docker** ≥ 20.10 (which ships the `compose` plugin)
- 2 GB RAM minimum, 4 GB recommended
- 10 GB free disk
- A domain or subdomain pointed at the server (for production)
- A reverse proxy that can terminate TLS (Apache, nginx, Caddy, Traefik, cPanel AutoSSL — all work)

You do NOT need:
- Node.js installed on the host (containers ship it)
- Postgres or Redis installed on the host (containers ship them)
- A new Meta App — reuse the ads app's App ID + Secret (see above)

## Install

```bash
# 1. Get the files onto your server
cd /opt
unzip vass-organic-install.zip -d vass-organic
cd vass-organic

# 2. Run the installer
./install.sh
```

The script will:

1. Check that Docker is working
2. Generate a `.env` with strong random secrets (Postgres password, session secret)
3. Ask for your public-facing URL (e.g. `https://organic.example.com`)
4. Build the backend + frontend images
5. Start all four services
6. Wait for the backend to be reachable
7. Run database migrations
8. Prompt for the first admin user (email + name + password)

Total time: 5–10 minutes on a 2-core machine, mostly Docker building.

## Running alongside the ads app

Every host-side resource is renamed so both stacks coexist on one box. Note the
infrastructure still carries the `vass-organic` name it was installed under —
container names, the `/opt` path and the database. That is deliberate: renaming
them means a reinstall and a data migration, and buys nothing a user ever sees.


| component | Vass (ads) | The Social Studio |
|-----------|-----------|--------------|
| compose project | `vass` | `vass-organic` |
| postgres | 5432 | 5433 |
| redis | 6379 | 6380 |
| backend | 4040 | 4041 |
| frontend | 3030 | 3031 |
| install root | `/opt/vass` | `/opt/vass-organic` |
| session cookie | `vass_session` | `vass_organic_session` |

`docker compose ls` should show them as two independent projects sharing no volumes.

## Reverse proxy

The Social Studio listens on `127.0.0.1:3031` (frontend) and `127.0.0.1:4041` (backend). Your reverse proxy needs two rules:

- `/`         → `127.0.0.1:3031`
- `/api/*`    → `127.0.0.1:4041` (stripping the `/api` prefix)

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name organic.example.com;

    ssl_certificate     /etc/letsencrypt/live/organic.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/organic.example.com/privkey.pem;

    client_max_body_size 100M;

    # API requests — strip /api/ then forward
    location /api/ {
        proxy_pass http://127.0.0.1:4041/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # Everything else → frontend
    location / {
        proxy_pass http://127.0.0.1:3031;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

### Caddy (simpler)

```caddy
organic.example.com {
    encode gzip
    handle_path /api/* {
        reverse_proxy 127.0.0.1:4041
    }
    handle {
        reverse_proxy 127.0.0.1:3031
    }
}
```

Caddy gets the TLS cert from Let's Encrypt automatically.

### Apache (cPanel / WHM)

See `docs/05-apache-proxy.md` for the full cPanel-specific instructions — it's a slightly more involved setup involving `ProxyPass` rules and custom rewrite snippets.

## First sign-in

1. Visit your public URL → login screen
2. Sign in with the admin credentials you set during install
3. Go to **Settings → Connections** → enter your Meta App ID + Secret (admin only — workspace-wide; **use the same App as the ads install**)
4. Add `https://your-domain/api/organic/accounts/callback` to that Meta App's **Valid OAuth Redirect URIs**
5. **Settings → Social profiles** → connect your Facebook Pages, Instagram, Threads, TikTok, LinkedIn
6. Open **Studio** and write something

To add a tester: see `docs/02-meta-setup.md` for the "Roles → Developer/Tester" flow on your Meta App, then create their user in **Team**.

## Day-to-day commands

```bash
docker compose ps                       # check what's running
docker compose logs -f                  # tail all logs
docker compose logs --tail=80 backend   # recent backend logs only
docker compose restart                  # rolling restart
docker compose down                     # stop (data preserved)
docker compose up -d                    # start again

# Apply a patch
./scripts/install-patch.sh /path/to/vass-organic-patch-X.Y.zip

# Make a DB backup
docker compose exec -T postgres pg_dump -U vassorganic vassorganic > backup-$(date +%F).sql

# Restore a backup
cat backup-2026-01-15.sql | docker compose exec -T postgres psql -U vassorganic -d vassorganic
```

The included `Makefile` has friendly aliases: `make up`, `make down`, `make logs`, `make backup`, `make migrate`. Run `make help` for the list.

## Updating

From a dev machine, `./deploy.sh` builds and verifies both apps, packages an app-code-only zip, uploads it, and prints the one root command to install it. See `docs/08-deploying-updates.md`.

On the server directly:

```bash
./scripts/install-patch.sh /path/to/vass-organic-patch-X.Y.zip
```

This rebuilds the changed containers and re-runs any new migrations. Existing data is preserved.

## Database schema

Migrations `001`–`041` are inherited **byte-for-byte** from the ads app, and `042_drop_ads_tables.sql` removes the ten ads-domain tables at the end. This looks odd for a fresh install — it creates tables only to drop them — and it is deliberate: replaying the exact history the production database already has guarantees a `pg_dump`/restore of real organic rows lands on a column-identical schema. Hand-writing a squashed initial migration is a silent-corruption risk. Squash once the standalone app has run on real data for a while; the reasoning is written out in full at the top of `042`.

## Backups

The whole database is one Docker volume (`organic_postgres_data`). The simplest safe backup is `pg_dump`:

```bash
docker compose exec -T postgres pg_dump -U vassorganic vassorganic | gzip > vass-organic-backup-$(date +%F).sql.gz
```

Schedule this in cron. Test the restore at least once.

**Critical: back up `.env`.** Specifically `SESSION_SECRET` — it's the key used to derive the AES encryption key for stored Meta, TikTok, Threads and LinkedIn secrets. If you lose it, every token in the DB becomes unrecoverable.

## Troubleshooting

| Symptom                              | First thing to check                                          |
|--------------------------------------|---------------------------------------------------------------|
| Port already in use during install   | Something else is on 3031/4041 — edit docker-compose.yml      |
| Backend keeps crash-looping          | `docker compose logs --tail=60 backend` — usually a migration failure or bad `.env` |
| Frontend shows "Application error"   | `docker compose logs --tail=80 frontend` — full stack trace there |
| Meta OAuth redirects to error page   | Your redirect URI in the Meta App doesn't match `FRONTEND_URL`/api/organic/accounts/callback |
| Uploads not appearing                | `organic_uploads` Docker volume — check it's mounted properly via `docker volume inspect` |
| Can't sign in after install          | Check `docker compose logs backend` for migration errors — schema may not be applied |
| Signed into the ads app, signed out here | Expected. Different cookie (`vass_organic_session`), different user table. |

`docs/06-troubleshooting.md` has the longer list.

## Security notes

- The whole stack binds to `127.0.0.1` only. Nothing is exposed to the public internet without your reverse proxy in front.
- Postgres password and `SESSION_SECRET` are 48-char random strings, generated locally by the install script.
- Platform access tokens are stored AES-256-GCM encrypted in the DB. The key is derived from `SESSION_SECRET` via SHA-256 — do not change `SESSION_SECRET` on a live install.
- Bcrypt with cost factor 12 for user passwords.
- Sessions are server-side cookies (`vass_organic_session`), HttpOnly + Secure + SameSite=Lax.
- There is no public signup. Admin creates every account.

## License

Internal use by Hyper Studio. Not licensed for external distribution.

## A note on the name, for anyone reading the code

The product is **The Social Studio**. The repo, containers, database and
`/opt` path still say `vass-organic`, because that is what it was installed
as and renaming infrastructure means a reinstall for zero user-visible gain.

Three `vass` strings inside the code are **load-bearing and must never be
renamed**:

| string | where | why |
|---|---|---|
| `vass-secret-encryption-v1` | `backend/src/utils/crypto.ts` | salt for the AES key that encrypts every stored access token. Change it and every Meta/TikTok/Threads/LinkedIn token in the database becomes undecryptable. |
| `vass-hmac-public-url-v1` | `backend/src/utils/crypto.ts` | salt for signed upload URLs. Change it and existing media links break. |
| `source = 'vass'` | `organic_posts` rows, and the queries reading them | a stored column value distinguishing posts this app created from posts synced back from Meta. Change it and Studio, Pipeline and Analytics stop recognising your own posts. |

The drag-and-drop MIME types (`text/vass-account`, `text/vass-unified`), the
`vass-upload:` URL scheme and the `vass:branding-updated` browser event are
internal identifiers — harmless, and not worth the churn.
