# WhatsApp query bot — setup record (2026-10-28)

> **Status update:** the bot is live on prod (env vars set, webhook pointed, admins approved) and now also runs the
> "Add a service" flow. The to-do list below is the original go-live checklist, kept for reference and rollback.
> Current behaviour is documented in `SPEC.md` §11 item 8. Optional: `WHATSAPP_SKIP_CONTENT_SID` (a "No" button on optional
> questions; create it with `scripts/create-whatsapp-skip-button.mjs`) and `WHATSAPP_PARSE_MODEL` (free-text parsing model).

A staff-only, read-only WhatsApp bot: approved people text the Twilio number and ask about
vehicles ("where's B0154?", "what's due for service this week?", "how many cars are on STR?").
Design and behaviour: `SPEC.md` §11 item 8. Code: `src/app/api/whatsapp/route.ts`,
`src/lib/whatsapp/{twilio,tools,bot,log}.ts`, admin toggle in `src/app/(app)/admin/users/`.

## Done
- Bot code written, typechecked, linted, committed (`3a13958`). Signature check and the route's
  403/503 paths are tested; the Claude loop and the fleet queries have NOT been run end to end
  (no Anthropic key / Twilio creds were available while building).
- Prod database migration applied 2026-10-28 (by hand, after backup `backups/prod-20261028-174227.dump`):
  `supabase/migrations/20261028090000_profile_whatsapp_access.sql` — `profiles.whatsapp_enabled`
  (false for everyone) and the empty `whatsapp_messages` log table (RLS, admin-read). Verified.
- Nobody can use the bot yet: no one is approved and the env vars below are not set.

## To do, in order
1. **Credentials** — Anthropic API key (console.anthropic.com -> API keys; account needs credit);
   Twilio Account SID (`AC...`) and Auth Token (Twilio Console home -> Account Info);
   the Twilio WhatsApp sender number (Messaging -> Senders -> WhatsApp senders, or the sandbox page).
2. **Vercel env vars** (Settings -> Environment Variables, Production; mark the key and token Sensitive;
   no quotes or trailing spaces):
   - `ANTHROPIC_API_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM` = `whatsapp:+27...` (prefix, plus sign, country code, no spaces)
   - `WHATSAPP_WEBHOOK_URL` = `https://sa-rent-2-own.vercel.app/api/whatsapp` (must match what Twilio calls exactly)
   Optional: `WHATSAPP_BOT_MODEL` (default `claude-opus-5-5`; e.g. `claude-haiku-5-5` to cut cost).
3. **Deploy** — new env vars only apply to a new deployment. Confirm which branch Vercel treats as
   Production (Settings -> Git -> Production Branch; GitHub's default branch here is
   `claude/hopeful-volta-ew7rh5`, and a separate `main` exists), then make sure that branch has the
   bot commit and redeploy. The migration is already in prod, so deploying is safe.
4. **Twilio webhook** — set "When a message comes in" to `https://sa-rent-2-own.vercel.app/api/whatsapp`,
   method POST (sandbox: Messaging -> Try it out -> Sandbox settings; registered sender: the sender's config).
   It is currently pointed somewhere else (unknown) — note it before changing in case you need to revert.
   If it's the sandbox, each tester must first send `join <code>` (lasts 72h).
5. **Approve yourself** — Admin -> Users -> "Approve" on your row. Your profile phone must match the
   WhatsApp number you message from (SA numbers, stored as +27...). Send a test message.
6. **Check it worked** — a reply arrives, and the exchange is in `whatsapp_messages`
   (Supabase table editor, or `select * from whatsapp_messages order by created_at desc limit 20`).
   If nothing arrives: Vercel function logs for `/api/whatsapp` (403 = signature/URL mismatch, check
   `WHATSAPP_WEBHOOK_URL` and the auth token; 503 = `TWILIO_AUTH_TOKEN` missing).
7. **Approve the team** one by one in Admin -> Users. Admin and Fleet Manager roles only.

## Good to know
- Replies work without Twilio business approval because they're sent inside the 24h window after the
  person's own message; the bot cannot start conversations.
- Limits: 30 messages/hour and 150/day per number; unapproved numbers get one "not set up" reply per hour.
- Short memory: the last 8 answered messages from the past 30 minutes are sent as context.
- The bot never reads client ID numbers, cell numbers, banking or purchase/sale prices; contract details
  are admin/Fleet Manager only and outstanding balances admin only.
- No retention policy on `whatsapp_messages` and no admin screen for it yet.
- Rollback: unset the env vars / point the Twilio webhook elsewhere. The DB change is harmless to leave;
  to remove it: `drop table public.whatsapp_messages; alter table public.profiles drop column whatsapp_enabled;`
  (and delete `20261028090000` from `supabase_migrations.schema_migrations`).

## Separate thread: client exception sheet
Corrections from her returned sheet were applied to prod 2026-10-28 (SPEC §11 item 22). A follow-up
sheet of remaining questions is out with her: `data/SAR2O reload follow-up questions 2026-10-28.xlsx`
(git-ignored). When it comes back, build the Rental contracts, "back in stock" statuses, vehicle/client
swaps and the 9 unattached deals as another guarded patch (see item 22).
