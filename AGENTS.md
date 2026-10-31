# Project requirements confirmed by the owner

- Patient conversations, appointment booking, attendance confirmation, rescheduling and Telegram reminders must run through the clinic's connected Telegram ACCOUNT (Telethon, phone/QR connection).
- Telegram bots are for CRM login only. Do not introduce or activate a separate patient-facing bot or request a patient-bot token.
- Staff should monitor and pause conversations when needed; ordinary booking conversations should proceed automatically.
- Write warm, natural Uzbek/Russian/English replies, preserve conversation context and avoid repetitive command menus. Do not falsely claim that an automated assistant is human when asked directly.
- Do not infer a patient's current location/time zone from phone prefix, language, or online status. Use explicit patient statements or a verified stored time zone; otherwise label appointment times as Tashkent time and disclose the unknown-zone fallback in operator documentation.
- Keep clinic accounts and patient records strictly scoped to the clinic. Never fall back to clinic 1 or another clinic when account ownership is unknown.
- Use isolated database tests and mocked Telegram delivery for verification. Live account messaging requires a deliberate live test.
