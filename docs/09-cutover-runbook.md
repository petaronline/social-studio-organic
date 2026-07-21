# Cutover runbook — going live with Vass Organic

Start to finish, in order. Steps 1–3 need a browser (DNS panel, Meta dashboard,
WHM); steps 4–7 need a root shell on `cpanel.teenstar.rs`. Nothing here touches
the running ads app until step 8, which is optional and reversible.

Budget about an hour, most of it Docker building.

---

## 1. DNS

Point a subdomain at the same box the ads app runs on.

```
organic.petaronline.us.   A   <same IP as vass.petaronline.us>
```

Wait for it to resolve before continuing — AutoSSL will fail otherwise:

```bash
dig +short organic.petaronline.us
```

## 2. Meta App — add the redirect URI

The App ID and Secret stay **the same as the ads app**. That is what keeps every
already-connected Page and IG account working without a reconnect, and it's why
no new App Review is needed — `pages_manage_posts`, `instagram_content_publish`
and friends are already approved on this app.

In [developers.facebook.com](https://developers.facebook.com) → your app →
**Facebook Login → Settings → Valid OAuth Redirect URIs**, add:

```
https://organic.petaronline.us/api/organic/accounts/callback
```

Leave the existing `vass.petaronline.us` entries in place — the ads app still
uses them.

While you're in there, the ads app now also asks for `pages_show_list`,
`pages_read_engagement` and `pages_manage_engagement` (Comment Guard resolves
its own page tokens now). Those are already granted to this app; no change
needed here, but every ads user must reconnect once — see step 9.

## 3. Apache vhost

WHM → **Apache Configuration → Include Editor → Post VirtualHost Include →
All Versions**. Paste `deploy/organic-vhost.conf`, click Update, restart Apache.

Then WHM → **Manage AutoSSL → Run AutoSSL For All Users** to get the cert.

## 4. Install the app

As root:

```bash
mkdir -p /opt/vass-organic
cd /opt/vass-organic
# upload the repo here (git clone, or scp a zip and unzip)
git clone https://github.com/petaronline/vass-organic.git .
./install.sh
```

The installer generates `.env`, builds both images, starts all four services,
runs migrations `001`–`042`, and prompts for a first admin user.

**When it asks for the public URL, answer** `https://organic.petaronline.us`.

Sanity check before moving on:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://organic.petaronline.us/api/health   # expect 200
docker compose ls     # expect BOTH 'vass' and 'vass-organic', independent
```

## 5. Back up the ads database

Non-negotiable. The next step reads from it.

```bash
docker exec -i vass-postgres pg_dump -U vass vass | gzip > /root/vass-pre-split-$(date +%F).sql.gz
ls -lh /root/vass-pre-split-*.sql.gz
```

## 6. Copy the organic data across

```bash
/opt/vass-organic/scripts/migrate-from-vass.sh
```

It refuses to run if the target database is non-empty or unmigrated, restores
inside a single transaction, copies the uploads volume, and prints a row-count
comparison per table at the end. Every row should match.

Skipped deliberately: sessions (everyone signs in fresh), oauth_states,
notifications, audit_log, and the ten ads tables that migration 042 dropped.

## 7. Verify — before touching anything else

- [ ] Sign in at `https://organic.petaronline.us` with an existing password
- [ ] **Settings → Connections** shows the Meta App ID already filled in
- [ ] **Settings → Social profiles** lists every previously connected account
- [ ] **Studio** opens, brand selector lists brands and profiles
- [ ] **Analytics** renders posts and insight numbers
- [ ] Publish one real test post to a low-stakes account, end to end
- [ ] `docker compose logs --tail=50 backend` is clean
- [ ] The ads app at `vass.petaronline.us` still works, including `/organic`

Run both in parallel for a week. Nothing forces a cutover date.

## 8. Retire `/organic` in the ads app (optional, later)

Only once Vass Organic has been the daily driver for a while and you've taken a
fresh backup. In the `vass` repo: delete the organic routes, services, pages and
sidebar group, then ship it with `./deploy.sh`. The organic tables can stay in
the ads database — dead but harmless — until you're certain.

## 9. Ads users reconnect Meta once

Comment Guard no longer borrows page tokens from the organic tables; it reads
them from `/me/accounts`, which needs three page scopes the ads app didn't ask
for before. Existing tokens don't have them.

Tell each ads user: **Settings → Meta → Reconnect**. Until they do, their
Comment Guard targets show "connect Page to enable" and hide nothing. Everything
else in the ads app is unaffected.

---

## If something goes wrong

Nothing in steps 1–7 modifies the ads app or its database — the migration script
only reads from it. To abandon the attempt:

```bash
cd /opt/vass-organic && docker compose down -v   # -v also drops its volumes
```

Then remove the vhost include and the DNS record. The ads app never knew.
