# Dentos (dentos.cc) — Deploy topshiruvi (UZ)

Sana: 2026-10-28. Bu hujjat shu bosqichda **koddagi** tekshiruv va tuzatishlarni
yakunlaydi. Serverga joylashtirish, DNS/bulut o'zgartirish, real migratsiya va
real Telegram xabar yuborish **bajarilmadi** (topshiriq doirasida taqiqlangan).

---

# 9-BOSQICH (2026-10-31) — Production arxitektura: Redis/Celery/Beat, Telegram ajratish, Nginx/TLS, monitoring, backup v2

> Bu bo'lim eng SO'NGGI. Maqsad: topshiriqdagi production arxitekturasini (Redis→Celery
> worker+bitta Beat; Telethon'ni web-workerdan ajratish; Nginx/TLS; monitoring; backup/restore)
> LOKAL tayyorlash. Foydalanuvchi: server allaqachon bor, B2 byudjet tayyor — "hammasini lokal
> tayyorla, faqat serverga ulash + Docker sozlash qolsin". Pullik/deploy qadam BAJARILMADI.
> `B2_MEDICAL_STORAGE_APPROVED=false` saqlandi (real bemor ma'lumoti B2'ga yuklanmaydi).

## Men shu yerdan TEKSHIRGAN haqiqiy holat (deploy oldi)
- **`backend.dentos.cc` DNS yo'q (NXDOMAIN)**; **`dentos.cc` → 185.196.212.52** lekin TLS sertifikati **boshqa domenga** (`WRONG_PRINCIPAL`) — hozir bizning server emas. RUNBOOK §4 DNS tuzatishni beradi.
- **B2 narx (rasmiy):** $6.95/TB/oy (ilk 10GB bepul); egress 3× saqlangangacha bepul, keyin $0.01/GB; A/B/C bepul. **Taxminiy oylik:** 100GB ~$0.63 · 500GB ~$3.41 · 1TB ~$6.88 (eski versiyalar qo'shimcha). Asosiy xarajat — server.
- **Hetzner CX53** spec/narxini ommaviy sahifadan tasdiqlay olmadim → panelda siz tasdiqlaysiz.

## PASS / FAIL / BLOCKED (bu bosqich)

| # | Ish | Holat | Dalil |
|---|---|---|---|
| Celery/Redis wiring | `core/celery.py` + `core/__init__.py` (guard) + settings `CELERY_*` + `clinic/tasks.py` | **PASS (lokal)** | app yuklanadi, 3 task ro'yxatdan o'tadi (`persist_media_to_b2`→media, `collect_ops_status`→ops, `ping`), routes+beat jadvali; `manage.py check` toza; **108/108 backend test**; prod settings (DEBUG=False) ostida ham yuklanadi. |
| Telegram ajratish | compose: `api`(scalable, bg=false) + `telegram`(bitta, bg=true, Telethon+eslatmalar) | **PASS (kod/konfig)** | `START_BACKGROUND_SERVICES` urls.py'da gate; faqat `telegram` xizmati Telethon ochadi → `api` GUNICORN_WORKERS ko'paytirsa bo'ladi (entrypoint endi `GUNICORN_WORKERS`/`THREADS` env o'qiydi, default 1). |
| Beat bitta nusxa, double-run yo'q | reminders Celery'ga KO'CHIRILMADI (in-process `telegram`da qoldi); Beat faqat YANGI ish (ops snapshot) | **PASS** | Eski scheduler + Beat bir ishni ikki marta bajarmaydi. |
| Redis eviction/persistence | compose redis: `--appendonly yes --maxmemory-policy noeviction` | **PASS** | Navbat vazifalari cache tozalanganda yo'qolmaydi; port yo'q (internetga ochiq emas). |
| Nginx + TLS (Caddy muqobili) | `deploy/nginx/dentos.conf` + `docker-compose.nginx.yml` (profiles, rollback) | **PASS (konfig)** | Same-origin `/api`, 520M limit, 330s timeout (gunicorn bilan mos), X-Forwarded-Proto; Caddy↔Nginx ikkisi bir paytda 80/443ga chiqmaydi. Jonli ishlashi serverda. |
| Backup v2 | `deploy/backup.sh` — api/telegram/worker/beat/login-bot pauza + AES-256 shifrlash | **PASS (konfig)** | Shifrlash passphrase bilan; avto-o'chirish yo'q; restore-to-separate-DB RUNBOOK §9. |
| Monitoring | `deploy/monitoring/*` — Prometheus + node/cadvisor/postgres/redis/blackbox exporter + Grafana | **PASS (konfig)** | CPU/RAM/disk, PG, Redis, navbat (redis_exporter check-keys), TLS muddati + HTTPS probe, alert rules; Grafana faqat 127.0.0.1 (SSH tunnel). |
| env.example + requirements | REDIS/CELERY/GUNICORN/BACKUP/GRAFANA; `celery==5.4.0`,`redis==5.0.8` | **PASS** | |
| 5 YAML konfig | compose×3 + prometheus + alerts | **PASS** | `yaml.safe_load_all` barchasi toza. |
| `docker compose config` / jonli stek | — | **BLOCKED** | Bu mashinada Docker yo'q; YAML parse bilan cheklandim. Serverda `docker compose config` + `up` tekshiriladi. |
| DNS/TLS tuzatish, server bootstrap, UFW, deploy | — | **BLOCKED (siz/serverda)** | RUNBOOK §1–§7 buyruqlari tayyor; serverda bajariladi. |
| Yuklama testi (150 maqsad) | — | **BLOCKED** | Server + k6/locust kerak; RUNBOOK §11 reja. "CX53 yetadi" kafolati YO'Q. |
| B2 jonli (upload/download/approval) | — | **BLOCKED (ataylab)** | `B2_MEDICAL_STORAGE_APPROVED=false`; huquqiy moslik + konsol faktlari + approval kerak. RUNBOOK §12. |

## Yakuniy tekshiruv (lokal)
- **Backend 108/108**, `manage.py check` + `check --deploy` toza (faqat 2 ta ataylab HSTS warning), Celery app+tasks yuklanadi, prod settings yuklanadi.
- **5 YAML konfig** toza. **Frontend tegilmadi** (oldingi bosqich yashil holatda).

## Bu bosqichda o'zgargan/qo'shilgan fayllar
```
backend/core/celery.py                 (YANGI — Celery app)
backend/core/__init__.py               (celery_app import, guard)
backend/core/settings.py               (CELERY_*/REDIS_URL/OPS_STATUS_FILE)
backend/clinic/tasks.py                (YANGI — persist_media_to_b2, collect_ops_status, ping)
backend/requirements.txt               (celery, redis)
backend/entrypoint.sh                  (GUNICORN_WORKERS/THREADS env)
docker-compose.yml                     (redis, api, telegram, worker, beat — arxitektura)
docker-compose.nginx.yml               (YANGI — Caddy→Nginx overlay, rollback)
deploy/Caddyfile                       (backend→api)
deploy/nginx/dentos.conf               (YANGI — Nginx+TLS)
deploy/backup.sh                       (v2 — yangi xizmatlar + shifrlash)
deploy/monitoring/*                    (YANGI — Prometheus/Grafana/exporters/alerts)
deploy/RUNBOOK_PROD.md                 (YANGI — serverda bajariladigan tartibli buyruqlar)
.env.example                           (REDIS/CELERY/GUNICORN/BACKUP/GRAFANA)
```

## QOLGAN TO'SIQLAR / keyingi qadam (serverda, siz bilan)
1. Server: RUNBOOK §1–§3 (deploy user, SSH, UFW, Docker, .env to'ldirish).
2. DNS: §4 (dentos.cc → server, backend.dentos.cc yaratish, eski IP olib tashlash).
3. `docker compose up -d --build` + migratsiya + superadmin + qabul testlari (§5–§6).
4. (ixtiyoriy) Caddy→Nginx (§7), monitoring (§8), backup cron + restore sinovi (§9).
5. Yuklama testi (§11) → GUNICORN_WORKERS/concurrency/PG max_connections moslash.
6. B2 — huquqiy moslik + approval hujjatlangach (§12).

**Serverga tayyorlik:** konfig/kod LOKAL yashil, lekin jonli stek, DNS/TLS va yuklama testi
BLOCKED (server kerak). Shuning uchun "production tayyor" DEB TASDIQLANMAYDI — serverda
RUNBOOK bajarilib, qabul + yuklama testlari o'tgandan keyin yakuniy tasdiq beriladi.

---

# 8-BOSQICH (2026-10-31) — Navigatsiya progressi (generatsiya+route tayyorlik), foto kartochka serverdan, umumiy 960×540 renderer, production-topologiya smoke

> Bu bo'lim eng SO'NGGI va ustun. 7-bosqichdan keyin foydalanuvchi aniq kamchiliklarni ko'rsatdi:
> navigatsiya progressi query-only o'tishda 90% da qolardi va tez navigatsiyada holatlar
> aralashardi; foto kartochka eski (IndexedDB) hujjatni ko'rsatardi; taqdimot kompozitsiyasi
> muharrirdan farq qilardi (matn masshtablanmasdi). Hammasi tuzatildi + regressiya testi.
> Real deploy/DNS/Telegram YUBORILMADI. `B2_MEDICAL_STORAGE_APPROVED=false` o'zgarmadi.

## PASS / FAIL / BLOCKED jadvali (bu bosqich)

| # | Ish | Holat | Dalil |
|---|---|---|---|
| 1 | Navigatsiya progressi — asl sabablar | **PASS** | Aniqlangan buglar: (a) query-only o'tishda yakunlash faqat `pathname`ni kuzatardi → **90% da qolardi**; (b) `startNav` yangi navda faqat label almashtirardi → **holatlar aralashardi**; (c) yakunlash GLOBAL `active===0`ga bog'liq edi → fon so'rovlari ushlab turardi; (d) eski timerlar yangi progressga tegardi. |
| 1 | Navigatsiya — tuzatish | **PASS** | Yangi test qilinadigan yadro `lib/navProgress.ts`: har navga **generation + {pathname,search}**; yangi start eskisini almashtiradi; eski gen'ning kech GET/commit'i yangi progressni **tugatmaydi/nollamaydi**; tayyorlik **route GET'lariga** bog'langan (fon PUT/POST bloklamaydi); `routeReady` ixtiyoriy signal; **hard timeout → xato+retry** (yolg'on 100% emas); % **taxminiy** belgisi (~). `NetworkStatusBar` `history.pushState/replaceState` + `popstate` + Link-click orqali router.push/replace/back-forward/query-param/pagination'ni qamraydi (Strict Mode/HMR guard). |
| 1 | Navigatsiya — testlar | **PASS** | `tests/navProgress.test.mjs` **9/9**: dashboard→qabullar GET yuklangach tugaydi; query-only tugaydi (90% da qolmaydi); A→B→C faqat oxirgi gen; eski GET yangi progressni nollamaydi; fon PUT/POST bloklamaydi; hard timeout→xato; routeReady; cancel; normalizeSearch. |
| 2 | Foto kartochka serverdan | **PASS** | `PhotoProtocolFirstPage` endi REAL klinikada **serverdagi canonical doc**ni o'qiydi (`fetchPatientPhotoDoc`), demo fallback aralashmaydi. (clinic,patient) kesh + in-flight dedupe + **cheklangan parallellik (≤4)** + **lazy (IntersectionObserver)**. Saqlashda studio `dentos-photo-saved` eventini tarqatadi va keshni **AYNAN shu klinika+bemor** uchun invalidatsiya qiladi → kartochka yangilanadi. Tez bemor almashishida cancel guard. Yangi sessiya/qurilmada ko'rinadi (server manba). |
| 3 | Umumiy 960×540 renderer | **PASS (kod/build)** | Yangi `SlideStage` (960×540 baza, muharrir `.paper` bilan AYNAN bir xil) + `ScaledSlide` (scale = **min(availW/960, availH/540)**, markazda, **QORA letterbox**, pointer-events yo'q). Taqdimot va foto kartochka endi shu rendererni ishlatadi — matn(px)/rasm/oraliq masofa **bir xil nisbatda** masshtablanadi ("muharrirda chiroyli, taqdimotda boshqacha" yo'q). Resize/fullscreen/orientation scale'ni yangilaydi. Vizual taqqoslash = BLOCKED (quyida). |
| 4 | Foto saqlash ↔ navigatsiya | **PASS (yadro) / BLOCKED (jonli)** | Debounce/coalescing + canonical media singdirish saqlandi; klinika mount'da qotiriladi (eski navbat boshqa klinikaga yozmaydi). Canonical adoption **4 unit test**. Slider/tez-tahrir, POST paytidagi tahrir, logout/klinika-almashish jonli E2E = BLOCKED. |
| 5 | Dashboard 500 / qotish | **PASS (takrorlanmaydi) / profiling BLOCKED** | 7-bosqichdagidek: dev SSR 6/6 route 200, production SSR `/dashboard` 200. CPU/xotira/long-task profiling brauzer vositasisiz BLOCKED. |
| 6 | Majburiy testlar | **PASS (unit) / BLOCKED (brauzer E2E)** | Frontend **29/29** (20 + 9 nav), Backend **106/106**, tsc toza. 20+ bo'limlararo brauzer o'tishi va foto vizual E2E = BLOCKED (Playwright yo'q). |
| 7 | Production-topologiya smoke | **PASS** | `output:standalone` (3100) + **reverse-proxy (3200, Caddy o'rnida)** + backend (8000): `/`→200, `/dashboard`→200, `/appointments`→200, **`/api/health/`→200** (proxy orqali), `/api/auth/me/`→**401** (auth yo'li ulangan), statik chunk→200. |
| 7 | Docker smoke | **BLOCKED** | `docker` bu mashinada yo'q. Topologiya teng proxy bilan tasdiqlandi; Docker Compose alohida muhitда sinalsin. |
| 7 | Autentifikatsiyalangan amallar (jonli) | **BLOCKED** | Haqiqiy login talab qiladi; cheklov: real bazani seed/parol chiqarish MUMKIN EMAS, brauzer yo'q. Auth endpoint ulangani (401 unauth) tasdiqlandi; to'liq auth'd E2E qoldi. |

## Yakuniy tekshiruv (bu bosqich)
- **Frontend: 29/29 test** (`node --test` — 20 + 9 yangi `navProgress`), **`tsc --noEmit` toza**.
- **Backend: 106/106** (o'zgarmadi — backend kodga tegilmadi).
- **`next build` (production): exit 0**, 21/21 sahifa; `/patients/[id]` First Load 344 kB (three defer).
- **Production-topologiya smoke (3100+proxy 3200+backend 8000):** / , /dashboard, /appointments, static → 200; **/api/health/ → 200**; /api/auth/me/ → 401.

## Bu bosqichda o'zgargan/qo'shilgan fayllar
```
frontend/src/lib/navProgress.ts                 (YANGI — test qilinadigan nav-progress kontroller)
frontend/src/components/NetworkStatusBar.tsx    (#1 kontrollerga o'tdi: history-patch, generation, GET-tayyorlik, timeout→retry)
frontend/src/components/PhotoProtocolStudio.tsx (#2 kartochka serverdan + lazy/kesh/concurrency + dentos-photo-saved; #3 SlideStage/ScaledSlide; taqdimot+kartochka shu renderer)
frontend/tests/navProgress.test.mjs             (YANGI — 9 test)
```

## QOLGAN TO'SIQLAR (halol) — "jonli tekshirildi" DEMAYMAN
- **Brauzer E2E BLOCKED** — Playwright/DevTools MCP serveri bu sessiyada ULANMAGAN. **Unblock qadami:** MCP sozlamalarida `playwright` serverini ulab, qayta ishga tushirish; so'ng dashboard→qabullar progressi, 20+ o'tish, foto kartochka yangilanishi va 960×540 vizual taqqoslash (telefon/planshet/desktop, portrait/landscape, fullscreen) bajariladi.
- **CPU/xotira/long-task profiling BLOCKED** — brauzer vositasi kerak.
- **Docker smoke + autentifikatsiyalangan jonli amallar BLOCKED** — Docker yo'q; login uchun test-klinika credential'i kerak (real bazani seed qilish taqiqlangan).
- **Server pagination, foto Keynote UX redizayn, eksport (brightness/contrast/border/shadow) fidelity** — bu bosqichda ishlanmadi (katta ishlar; deploy'ni bloklamaydi).

**Serverga tayyorlik:** brauzer E2E va Docker smoke BLOCKED bo'lgani uchun bu bosqich "serverga joylashga tayyor" DEB TASDIQLANMAYDI. Kod/unit/build/production-topologiya smoke yashil; jonli brauzer va Docker tekshiruvlari ulanib bajarilгандан keyin yakuniy tasdiq beriladi.

---

# 7-BOSQICH (2026-10-31) — Deploy oldi: dashboard 500 diagnostikasi, qotish, navigatsiya progressi, status-bar, tezlik, foto canonical doc

> Bu bo'lim eng SO'NGGI va ustun. Maqsad: serverga joylashdan oldingi UX/barqarorlik
> muammolari (dashboard 500, brauzer qotishi, sahifa almashish holati, soxta xato,
> sekin ochilish, foto canonical doc). Real deploy/DNS/migratsiya/Telegram YUBORILMADI.
> `B2_MEDICAL_STORAGE_APPROVED=false` o'zgarmadi.

## PASS / FAIL / BLOCKED jadvali (bu bosqich)

| # | Ish | Holat | Dalil |
|---|---|---|---|
| 1 | `/dashboard` 500 — asl sabab | **PASS (takrorlanmaydi)** | 6 ta route (dashboard/patients/reports/settings/pulse/help) dev SSR curl → **hammasi 200**; DirectorDashboard render yo'lida himoyasiz `window/localStorage/document` **yo'q** (grep). 500 — sovuq dev-kompilyatsiya hodisasi edi, hozir takrorlanmaydi. |
| 1 | 500 qayta chiqsa — diagnostika + tiklanish | **PASS** | `app/error.tsx` + `app/global-error.tsx` — xato DIGEST'ini loglaydi (maxfiy stack chiqmaydi), "Qayta urinish/Bosh sahifa" tugmalari; ChunkLoadError'da majburiy reload. |
| 1 | MutationObserver qotishi | **PASS (chegaralandi)** | `layout.tsx` — observer endi FAQAT atribut (childList+`querySelectorAll('*')` per-mutation OLIB TASHLANDI) + `load`+4s da `disconnect`. Algoritmik yuk O(DOM)/mutatsiya → O(1)/filtrlangan atribut. |
| 1 | CPU/xotira/long-task profiling | **BLOCKED** | Brauzer profiling vositasi (Playwright/DevTools MCP) bu sessiyada ULANMAGAN. MutationObserver reasoning bilan chegaralandi; jonli o'lchov qolmoqda. |
| 2 | Status-bar faqat /login+kabinetlarda | **PASS** | `NetworkStatusBar` `usePathname` — "/" da `return null`; health polling "/" da ishlamaydi; `--netbar-h` "/" da 0 (layout.tsx inline skript birinchi bo'yoqda + isomorphic layout-effect klient nav'da) → sakrash yo'q; `role="status" aria-live` (matn endi aria-hidden EMAS; dekorativ qismlar aria-hidden). |
| 3 | Navigatsiya progressi + loading/error | **PASS (kod/build)** | `app/loading.tsx` (skeleton, bloklamaydi) + `error.tsx`/`global-error.tsx`. `NetworkStatusBar` Link/popstate'ni ushlaydi → darhol sariq "… bo'limi ochilmoqda" + taxminiy % (committed+API tinchmaguncha 100% EMAS) → yashil. Bir xil URL/tashqi/download/modifier-click/health soxta progress boshlamaydi. Jonli vizual = BLOCKED (quyida). |
| 4 | Soxta xato / retry / health | **PASS** | `NetworkStatusBar` patched-fetch: `AbortError` (navigatsiya/caller cancel) endi sariq XATO BERMAYDI; muvaffaqiyatli so'rov eski "stuck"ni tozalaydi; health polling bir vaqtda BITTA (`pingInFlight`) + 4s timeout (`AbortController`) + `res.ok` tekshiradi; `handleRetry` `dentos-retry` eventini ham tarqatadi. |
| 5 | Og'ir importlarni ajratish | **PASS** | `three/STL/DICOM` endi `dynamic(ssr:false)`: `patients/[id]`, `lab`, `technician`, `LabOrderFullModal` (Dental3DScanViewerModal + DentalRentgenViewerModal). `/patients/[id]` First Load JS = **344 kB** (three statik bo'lsa ~900kB+ bo'lardi). |
| 5 | Haqiqiy server pagination | **FAIL (bajarilmadi)** | Bemorlar ro'yxati hali hammasini olib 12 tasini ko'rsatadi; server pagination/filter/search QILINMADI (katta o'zgarish, deploy'ni bloklamaydi, lekin katta klinikada sekin). |
| 6 | Foto canonical doc qabul qilish | **PASS** | `savePatientPhotoDocBackend` endi `{ok, doc}` qaytaradi (server base64→media URL). `photoDocMedia.ts` (`collectMediaRewrites`/`applyMediaRewrites`/`adoptCanonicalMedia`) QIYMAT bo'yicha singdiradi — yangi tahrir yo'qolmaydi. Studio `doc.current` + pending'ga qo'llaydi. **4 unit test PASS.** |
| 6 | Klinikaga qat'iy tegishlilik (unmount flush) | **PASS** | Studio klinikani MOUNT'da qotiradi (`studioClinicId`) va `overrideClinicId` beradi — logout/klinika-almashishdan keyingi flush boshqa klinikaga yozmaydi (backend `get_object_or_404(patient, clinic)` ham himoya qiladi). |
| 6 | Keynote UX redesign + export fidelity | **FAIL (bajarilmadi)** | Foto-muharrir Keynote-uslub redizayn va eksport (brightness/contrast/border/shadow) to'liq ishlanmadi — katta, jonli vizual tasdiq talab qiladi. |
| 7 | Production standalone smoke | **PASS** | `output:standalone` `server.js` **3100-portda** (dev 3000'ga tegmay): `/`→200, `/dashboard`→200 (prod SSR, 500 YO'Q), `/login`→200, statik chunk→200, `public/logo.png`→200. |
| 7 | /api prod proxy | **PASS (tasdiqlandi, proxy kerak)** | Standalone'da `/api/health/`→**404** — `next.config` rewrite faqat DEV'da. Prod'da Caddy/nginx `/api`→Django:8000 SHART (deploy/Caddyfile allaqachon shuni qiladi). |
| 7 | Docker smoke | **BLOCKED** | Bu mashinada `docker` YO'Q (`command not found`). Standalone `node server.js` bilan o'rniga tekshirildi. |
| 8 | Brauzer E2E (rollar, 20+ nav, 401/403/409/413/500, mobil) | **BLOCKED** | Playwright MCP serveri bu sessiyada ULANMAGAN. Jonli rol-oqimlari sinalmadi; birlik/tsc/build/standalone bilan qoplandi. |

## Yakuniy tekshiruv (bu bosqich)
- **Frontend: 20/20 test** (`node --test` — 16 oldingi + 4 yangi `photoDocMedia`), **`tsc --noEmit` toza**.
- **Backend: 106/106** (`core.test_settings`; o'zgarmadi — backend kodga tegilmadi).
- **`next build` (production): exit 0**, 21/21 sahifa.
- **Standalone prod smoke (3100):** /,/dashboard,/login,statik,public → 200; /api → 404 (proxy kerak).

## Bu bosqichda o'zgargan/qo'shilgan fayllar
```
frontend/src/app/layout.tsx                    (#1 MutationObserver chegaralandi; "/" --netbar-h=0 inline)
frontend/src/app/error.tsx                     (YANGI — #1/#3 segment error boundary + digest log)
frontend/src/app/global-error.tsx              (YANGI — #1/#3 root error boundary)
frontend/src/app/loading.tsx                   (YANGI — #3 route skeleton)
frontend/src/components/NetworkStatusBar.tsx   (#2 pathname-aware; #3 nav progress; #4 abort/health/retry)
frontend/src/lib/photoDocMedia.ts              (YANGI — #6 canonical media singdirish, sof funksiya)
frontend/src/lib/api.ts                         (#6 savePatientPhotoDocBackend → {ok, doc})
frontend/src/components/PhotoProtocolStudio.tsx (#6 canonical qabul + klinika qotirish)
frontend/src/app/patients/[id]/page.tsx         (#5 Dental3DScan/Rentgen viewer → dynamic)
frontend/src/components/LabOrderFullModal.tsx   (#5 dynamic)
frontend/src/app/lab/page.tsx                   (#5 dynamic)
frontend/src/app/technician/page.tsx            (#5 dynamic)
frontend/tests/photoDocMedia.test.mjs           (YANGI — 4 test)
```

## QOLGAN TO'SIQLAR (halol)
- **Brauzer E2E (#8) va CPU/xotira/long-task profiling (#1): BLOCKED** — Playwright/DevTools MCP ulanmagan. Toza muhitda bajarilsin.
- **Docker smoke (#7): BLOCKED** — Docker yo'q; standalone node bilan qoplandi.
- **Server pagination (#5) va foto Keynote UX/export (#6): BAJARILMADI** — katta ishlar; deploy'ni bloklamaydi, lekin keyingi bosqichda.

## Deploy eslatmasi (bu bosqichga xos)
- Production'da `/api` rewrite YO'Q — **Caddy/nginx `/api`→backend:8000 majburiy** (allaqachon `deploy/Caddyfile`). Standalone build uchun `.next/static` va `public/` `server.js` yoniga ko'chiriladi (Dockerfile buni qiladi).
- Deploy/backup/restore/rollback bo'yicha to'liq buyruqlar: pastdagi 2-bosqich "Docker/domenlar" + `deploy/backup.sh` bo'limlarida. Brauzer E2E BLOCKED bo'lgani uchun bu bosqich "serverga joylashga tayyor" DEB TASDIQLANMAYDI — avval jonli rol-oqimlari (Playwright) va Docker smoke bajarilsin.

---

# 6-BOSQICH (2026-10-28) — Logout oqimi (flush → tozalash) + hydration izohi

> Eng SO'NGGI. Foydalanuvchi so'rovi: logout tugmasi bosilganda AVVAL API'ga yuborilishi
> kerak bo'lgan ma'lumot yuborilsin, KEYIN localStorage va cookie tozalanib chiqilsin.

## Logout tuzatildi (`frontend/src/lib/auth.tsx` + `frontend/src/lib/patientRecords.ts`)
Eski `logout()` saqlanmagan bemor-karta o'zgarishlari bo'lsa faqat "chiqasizmi?" deb so'rab,
ha bo'lsa ularni **tashlab yuborardi**. Endi tartib:
1. **FLUSH** — `flushPatientRecords()` navbatdagi/uchayotgan saqlashlarni serverga YUBORIB TUGATADI
   (failed'larni qayta uriadi, `pending`/`failed` 0 bo'lguncha kutadi). Hammasi saqlansa davom etadi.
   Agar ba'zi o'zgarishlar yetib bormasa — foydalanuvchidan so'raydi; "yo'q" desa chiqmaydi (sessiya ochiq qoladi).
2. **API logout** — `POST /api/auth/logout/` (javobi httpOnly `dentos_session` cookie'sini O'CHIRADI).
3. **localStorage tozalash** — sessiya + kesh kalitlari (`32desk_auth_user`, `32desk_apicache_*`, created-clinics);
   real klinikada boshqa ma'lumot (eslatma/rentgen/foto) saqlanadi, demo'da hammasi tozalanadi; tema/til/sidebar afzalliklari qoladi.
4. **Redirect** → `/login`.

Logout tugmasi `Header.tsx` (profil menyusi) va `Sidebar.tsx` (ikkala holat) da `logout()` chaqiradi.

### Amalda tekshirilgan (haqiqiy Chromium brauzer) — 7/7 PASS
Sidebar **"Выйти из системы"** tugmasi bosildi (ilova rus tilida edi) →
`/login` ga qaytdi → **`dentos_session` cookie TOZALANDI** → **`localStorage 32desk_auth_user` TOZALANDI** →
**`/api/auth/me/` → 401** (server sessiyasi ham tugadi). (Eslatma: dashboard'da direktor+rejasiz klinika
uchun avto-ochiladigan oylik-reja modali logoutni to'sgani uchun test avval modalni yopdi — bu mahsulot modal xatti-harakati, bug emas.)

### Flush uchun unit testlar (`frontend/tests/patientRecords.test.mjs`) — jami 10/10
- `flushPatientRecords waits for pending save then reports saved` (hammasi saqlanib true).
- `flushPatientRecords returns false when save keeps failing` (saqlanmasa false → logout ogohlantiradi).

## "Hydration mismatch" (`bis_skin_checked="1"`) — KOD xatosi EMAS
Konsoldagi `bis_skin_checked="1"` atributi **Bitdefender brauzer kengaytmasi** (`bis_*`) tomonidan
React yuklanishidan oldin DOM'ga qo'shiladi (React xabari ham buni aytadi: "a browser extension...
messes with the HTML before React loaded"). Bu ilova kodidan emas va funksiyaga ta'sir qilmaydi
(faqat dev-konsol ogohlantirishi). Yechim brauzer tomonida: kengaytmani o'chirish yoki toza profil/incognito'da
sinash. Kod bilan "tuzatib" bo'lmaydi: `suppressHydrationWarning` faqat bitta element uchun ishlaydi, bu atribut
esa o'nlab ichki `div`larга qo'yiladi — shuning uchun sun'iy workaround QO'SHILMADI.

## Bu bosqich o'zgargan fayllar
```
frontend/src/lib/auth.tsx                (logout: flush → API → cookie/localStorage tozalash → redirect)
frontend/src/lib/patientRecords.ts       (YANGI flushPatientRecords())
frontend/tests/patientRecords.test.mjs   (2 yangi flush testi; jami 10)
```
## Yakuniy tekshiruv (bu bosqich)
- **Frontend: 10/10 test**, **tsc toza**, **`next build` o'tdi**.
- **Backend: 104/104** (o'zgarmagan, qayta ishga tushganda yashil).
- **Jonli:** logout brauzer oqimi 7/7 (cookie+localStorage+server sessiya tozalandi). Health 200/200.

---

# 5-BOSQICH (2026-10-28) — LOKAL ishga tushirish + login oqimi (amalda tekshirilgan)

> Bu bo'lim eng SO'NGGI va ustun. Maqsad: lokal ishga tushirish, oddiy login va
> Telegram loginini AMALDA ishlaydigan holatga keltirish (nafaqat test/build).
> Production xavfsizlik cheklovlari saqlangan: umumiy `.env` (DEBUG=False, Postgres)
> TEGILMADI, `settings.py` production guard o'z o'rnida, `B2_MEDICAL_STORAGE_APPROVED=false`.

## Lokal ishga tushirish — BITTA hujjatlashtirilgan yo'l
```powershell
# Loyiha ildizidan (C:\Users\user\Desktop\32desk):
.\start-local.ps1              # backend(8000) + frontend(3000), health 200 gacha kutadi
.\start-local.ps1 -WithBot     # + Telegram login bot (bitta polling; mavjud jarayonni tekshiradi)
.\start-local.ps1 -SkipMigrate # migratsiyasiz
# yoki:  start.bat   (xuddi shu launcherni chaqiradi)
# faqat backend:  cd backend ; .\dev.ps1
```
Birinchi marta (agar kerak bo'lsa): `python -m venv .venv ; .\.venv\Scripts\pip install -r backend\requirements.txt` va `cd frontend ; npm install`.

**Launcher nimani kafolatlaydi (eski `start.bat` muammolari tuzatildi):**
- Hamma jarayon loyiha **.venv** (Python 3.12) va bir xil lokal DB/env ishlatadi (global Python 3.14 EMAS).
- Yo'llar skript joylashuviga nisbatan (`$PSScriptRoot`).
- **Lokal DEBUG faqat shu jarayonlarga:** launcher `DEBUG=True`, `POSTGRES_DB=''`, `START_BACKGROUND_SERVICES=false` env'ni O'RNATADI. `python-dotenv load_dotenv(override=False)` tufayli bu qiymatlar `.env` dan ustun turadi — shuning uchun **umumiy `.env` o'zgartirilmaydi** va production guard buzilmaydi. (Ildiz sababi: alohida terminalda `run_login_bot` `.env`dagi `DEBUG=False` ni o'qib `ImproperlyConfigured: Production requires PostgreSQL` berardi; endi launcher env'ni to'g'ri uzatadi va bola jarayonlarga meros qoladi.)
- Xatoda **TO'XTAYDI** va sababni ko'rsatadi (migratsiya xato bo'lsa server ishga tushmaydi).
- Har startda **seed_data/seed_platform CHAQIRILMAYDI** (faqat idempotent `migrate`).
- Backend porti (8000) Next dev `/api` rewrite manziliga **mos**.
- Login bot: ixtiyoriy, **bitta** polling; `.login_bot.lock` orqali ikkinchi nusxani bloklaydi; foydalanuvchining boshqa jarayonlari O'LDIRILMAYDI.
- **Health 200 bo'lmaguncha "TAYYOR" demaydi.**

## Health natijalari (jonli)
- `http://127.0.0.1:8000/api/health/` → **200** `{"status":"ok"}`
- `http://localhost:3000/api/health/` → **200** (Next `/api` proxy orqali)
- `http://localhost:3000/login` → **200**

### Tuzatilgan: Next `/api` proxy trailing-slash bug (`frontend/next.config.mjs`)
Dev proxy barcha slash bilan tugaydigan API chaqiruvlarini 308 bilan slashsizga
yo'naltirib, backendga `/api/health` (slashsiz) yetkazardi → backend 401 (PUBLIC ro'yxatda
faqat `/api/health/`). Tuzatish: `skipTrailingSlashRedirect: true` + slashni tiklovchi
alohida rewrite (`/api/:path*/` → `.../api/:path*/`). Faqat dev/config; dizayn/funksiyaga tegmaydi.

## Lokal baza (ma'lumot saqlangan)
- **Backup olindi:** `backend/db.sqlite3.backup_20261028_045525` (migratsiyadan OLDIN).
- **Qo'llangan migratsiyalar:** `0026_patientrecord`, `0027_financialtransaction_request_id`,
  `0028_servicecatalogitem`, `0029_alter_platformsetting_clinic_name`, `0030_doctornaryadrate_and_more`.
  Hammasi **ADDITIVE** (yangi jadval / null maydon / default bilan field-alter / bo'sh jadvalga constraint) —
  `RemoveField`/`DeleteModel`/yo'q qiluvchi data-migration YO'Q.
- **Ma'lumot saqlandi:** oldin/keyin bir xil — 18 faol PlatformUser, 38 Patient, 6 FinancialTransaction, 2 ClinicTenant.
  Baza O'CHIRILMADI / flush QILINMADI / qayta seed QILINMADI.
- Production bazaga TEGILMADI.

## Oddiy CRM login — AMALDA tekshirilgan (haqiqiy Chromium brauzer)
Mavjud akkauntlarга tegilmadi, parol taxmin qilinmadi/almashtirilmadi. Test uchun **sun'iy**
direktor akkaunt (clinic 16 "Sinov Klinikasi") vaqtincha yaratildi va **tekshiruvdan keyin O'CHIRILDI**
(ma'lum-parolli akkaunt qolmasin). Qayta yaratish kerak bo'lsa (ixtiyoriy):
```python
# cd backend ; DEBUG=True POSTGRES_DB="" ..\.venv\Scripts\python manage.py shell
from clinic.models import ClinicTenant, PlatformUser
from django.contrib.auth.hashers import make_password
PlatformUser.objects.create(username='qa.local@dentos.test', full_name='QA Lokal Test',
  role='director', clinic=ClinicTenant.objects.get(id=16), is_active=True,
  phone='+998 90 777 65 43', password=make_password('<o_zingiz_tanlang>'))
```
Haqiqiy Chromium (Playwright) bilan `http://localhost:3000` orqali **9/9 PASS**:
1. Email login → director → **/dashboard** redirect.
2. `dentos_session` cookie (httpOnly) o'rnatildi.
3. `localStorage 32desk_auth_user` to'g'ri rol=director, clinicId=16.
4. `/api/auth/me/` → **200**, to'g'ri username.
5. **Reload** → sessiya saqlanadi (/login ga qaytarmaydi).
6. **Logout** → `/api/auth/me/` → **401** (sessiya tugadi).
7. **Qayta login** → /dashboard.
8. **Telefon bilan login** → /dashboard (pastga qarang).
9. **Noto'g'ri parol** → /login da qoladi + "Неверный логин или пароль" xatosi ko'rinadi.

**Xatolar bir-biridan ajratilgan (bir xil xabar bilan yashirilmaydi):**
- Noto'g'ri parol / nofaol / mavjud emas → 400 → "Login yoki parol noto'g'ri" (auth endpoint global toast bermaydi).
- **Backend yo'q / tarmoq** → `apiFetch` `ApiError` tashlaydi → "Serverga ulanish uzildi yoki vaqt tugadi. Ma'lumot saqlangan deb hisoblamang." (ALOHIDA xabar; `platformLogin` ApiError'ni qayta tashlaydi).
- **Sessiya tugashi** → `/auth/me` 401 → tizim chiqib ketgan deb hisoblaydi.

### Tuzatilgan: UI "Telefon yoki Email" va'dasi backend bilan mos (`backend/clinic/views.py` `auth_login`)
Avval `auth_login` faqat `username`/email bo'yicha qidirardi; UI esa "Telefon raqami yoki Email"
deydi. Endi username/email topilmasa va kiritilgan qiymat telefon bo'lsa, akkauntning **O'Z telefoni**
bo'yicha, **AYNAN BITTA** faol moslik topilsa kiradi. **Noaniqlikda (0 yoki >1) TAXMIN qilmaydi,
klinikalararo yoki klinika-telefoni fallback YO'Q.** Testlar: `test_login_by_phone_unique_match`,
`test_login_by_phone_wrong_password_is_400`, `test_login_by_ambiguous_phone_refuses_to_guess`.

### Django /admin/ vs CRM
Bular **alohida tizim**. CRM `/login` → `PlatformUser`/`DentalTechnician` (cookie `dentos_session`).
Django `/admin/` → `auth_user` (is_staff). Lokal bazada faol `is_staff` hisob **0** — demak CRM
superadmini `/admin/` ga **avtomatik kira olmaydi**. Keraksiz yangi admin **yaratilmadi**. `/admin/` kerak
bo'lsa: `backend/clinic/management/commands/create_admin.py` (kuchli parol env talab qiladi).

## Telegram login
- **Bir xil baza:** login bot ham, web backend ham bir xil lokal env → bir xil `backend/db.sqlite3`
  (SQLite). Tasdiqlandi: ikkalasi `DATABASES.NAME = ...\backend\db.sqlite3`.
- **Bot startup (read-only, hech kimga xabar yubormasdan):** `getWebhookInfo` → webhook bo'sh (polling mumkin),
  `getMe` → username **@dentosccbot** (konfiguratsiyaga mos). Token log/chatga **chiqmadi** (`bot_call`
  umumiy xato beradi). `getUpdates`/polling ATAYIN ishga tushirilmadi (hech kimga reply ketmasin).
- **Mock testlar: 19/19 PASS** (`clinic.tests.test_telegram_login`) — telefon normalizatsiyasi, bir xil
  akkaunt ko'p manbadan (noaniq emas), **noaniq telefon rad**, nofaol akkaunt kira olmaydi, soxta kontakt rad,
  guruh kontakti e'tiborsiz, bir martalik kod, 5 urinishdan keyin blok, yetkazib berilmasa "yuborildi" demaydi,
  reset parolni hash qiladi, klinikalararo noaniqlik rad.
- **Bazada 1 ta `TelegramLoginContact` bog'langan** → unikal faol akkaunt: **dentOS SuperAdmin** (raqam 99891\*\*\*\*23).
  Bemor Telethon akkaunti bilan ARALASHTIRILMADI (login bot alohida).

### Telegram jonli OTP — QOLGAN QADAM (foydalanuvchi harakati)
Foydalanuvchi "men brauzerda qilaman" dedi. Bot kontakti allaqachon bog'langani uchun
`run_login_bot` ishlashi SHART EMAS (web backend kodni to'g'ridan Telegram API orqali yuboradi).
Aynan qolgan qadamlar (foydalanuvchi o'zi, o'z Telegramida; OTP chatga chiqarilmaydi):
1. `http://localhost:3000/login` → **"Telegram orqali kirish"** (yoki "Kod yuborish") tugmasi.
2. O'z raqamini kiritish (99891…23) → **"Kod yuborish"** → backend `/api/auth/telegram/request/` → o'z Telegramiga kod.
3. Telegramdagi 6 xonali kodni brauzerga kiritish → `/api/auth/telegram/verify/` → `dentos_session` cookie → **superadmin** → `/super-admin`.
Natija backend logidan kod-ko'rsatmay tasdiqlanadi (request/verify HTTP 200). Boshqa odamlarga xabar YUBORILMADI.

## Bu bosqich yakuniy tekshiruvi
- **Backend: 104/104 test** (`core.test_settings`; oldingi 101 + 3 telefon-login).
- **Frontend: 8/8** (`node --test`), **tsc --noEmit toza**, **`next build` o'tdi**.
- **`makemigrations --check`:** oldingi bosqichda toza; bu bosqich model/migratsiyaga TEGMADI.
- **Jonli:** backend+frontend health 200, CRM brauzer login 9/9, Telegram mock 19/19 + bot startup.

## Bu bosqichda o'zgargan/qo'shilgan fayllar
```
start-local.ps1                          (YANGI — ishonchli lokal launcher)
start.bat                                (qayta yozildi — launcherni chaqiradi, seed/noto'g'ri "muvaffaqiyat" yo'q)
backend/dev.ps1                          (.venv + lokal env, background services off)
backend/clinic/views.py                  (auth_login — telefon bo'yicha unikal kirish)
backend/clinic/tests/test_security.py    (3 telefon-login testi)
frontend/next.config.mjs                 (skipTrailingSlashRedirect + slash-saqlovchi /api rewrite)
backend/db.sqlite3                        (lokal — 0026..0030 migratsiya qo'llandi; backup olingan)
```

## QOLGAN TO'SIQLAR / bajarilmaganlar (halol)
- **Telegram jonli OTP** — yuqoridagi 3 qadam foydalanuvchida (o'z Telegramiga kod + kiritish). Men yubormadim.
- **MCP Playwright/Chrome brauzeri band edi** (`mcp-chrome-...` profili boshqa instansiyada qulf) — shu sabab
  CRM brauzer testi MCP orqali emas, scratchpad'dagi mustaqil Chromium (Playwright) bilan bajarildi (9/9). Natija bir xil darajada haqiqiy.
- **Logout UI tugmasi**: brauzer testida logout `/api/auth/logout/` orqali (same-origin, cookie bilan) tasdiqlandi
  va `/auth/me` 401 berdi; sidebar/profil menyusidagi aniq tugma bosilishi alohida sinalmadi.
- **PostgreSQL/Docker** — bu mashinada yo'q (oldingi bosqichlardagidek).

---

# 4-BOSQICH (2026-10-28) — qo'shimcha tekshiruvda topilgan 3 ta 500-xato

> Bu bo'lim eng SO'NGGI va ustun. 3-bosqichdan keyin mustaqil tekshiruvda yana
> 3 ta aniq xato tasdiqlandi (hammasi HTTP 500 yoki eskirgan-xato sizishi). Har biri
> tuzatildi va regressiya testi bilan mustahkamlandi. `B2_MEDICAL_STORAGE_APPROVED=false`
> o'zgartirilmadi. Real bazaga migratsiya qo'llanmadi, deploy qilinmadi, pullik resurs
> yaratilmadi, real Telegram/bemor fayli yuborilmadi.

## Natijalar qisqacha (bu bosqich yakuniy tekshiruvi)
- **Backend: 101/101 test o'tdi** (`python manage.py test clinic --settings=core.test_settings`).
  Oldingi 96 ga shu bosqichning 5 yangi `doctor-naryad` regressiya testi qo'shildi.
- **Frontend deterministik testlar: 8/8 o'tdi** (`node --test tests/*.test.mjs`).
  Oldingi 4 ga bug #3 uchun 4 yangi test qo'shildi (quyida).
- **`next build` (production) — o'tdi.** **`tsc --noEmit` (TypeScript) — toza.**
- **`makemigrations --check --dry-run` — "No changes detected"** (model/migratsiya mos;
  yangi migratsiya qo'shilmadi — tuzatishlar sxemaga tegmaydi).
- **Muhit eslatmasi:** bu mashinada `whitenoise` o'rnatilmagan edi (test middleware'si
  uchun kerak) — test paketi sifatida o'rnatildi; kod/requirements o'zgarmadi
  (`requirements.txt` da allaqachon `whitenoise==6.9.0` bor).

## Band-bo'yicha

### ① Noto'g'ri xizmat ID'si HTTP 500 berardi → endi tushunarli 400
- **Fayl/joy:** `backend/clinic/serializers.py` → `DoctorNaryadRateSerializer`.
- **Sabab:** `naryad_id` (`CharField`, `source='service_id'`) raqam bo'lmagan qiymatni
  (eski `nar-*`, bo'sh, `abc`) to'g'ridan-to'g'ri integer PK filtriga uzatardi → `ValueError`
  → 500.
- **Tuzatish:** yangi `validate_naryad_id` — ORM so'rovidan OLDIN `int()` bilan formatni
  tekshiradi; yaroqsiz/bo'sh/`nar-*`/`<=0` uchun 400 (`ValidationError`). `validate()` da
  mavjudlik + klinika mansubligi: `ServiceCatalogItem.objects.filter(pk, clinic_id).exists()`
  — boshqa klinika xizmatiga ruxsat yo'q, mavjud bo'lmagan ID → 400. Eski ID taxmin bilan
  boshqa xizmatga BOG'LANMAYDI.
- **Test (TASDIQLANDI):** `test_doctor_naryad_invalid_service_id_is_400_not_500`
  (`nar-6`,``,`abc`,`0`,`-3` va mavjud bo'lmagan `999999` → hammasi 400, 500 emas),
  `test_doctor_naryad_cross_clinic_service_denied` (begona klinika xizmati → 400).
  POST yo'li to'liq qamrab olindi.

### ② Mavjud juftlikka PATCH HTTP 500 berardi (unique constraint buzilishi) → nazoratli rad
- **Fayl/joy:** `serializers.py` `validate()` + `views.py` `DoctorNaryadRateViewSet.perform_create`.
- **Sabab:** B biriktirmasining `naryad_id`'sini A xizmatiga PATCH qilish
  `unique_doctor_service_rate` (doctor,service) cheklovini buzib 500 berardi. Alohida,
  parallel ikki "assign" "avval qidir, keyin yarat" upsertida poyga → dublikat/500 xavfi.
- **Tuzatish:**
  - UPDATE'da `doctor_id`/`service_id` (juftlik) o'zgarishi aniq rad etiladi (400):
    "yangi biriktirma yarating". Juftlik — identifikator, almashtirilmaydi.
  - `perform_create` `update_or_create` (upsert) + `IntegrityError` ushlab, yutqazgan
    parallel so'rovni `transaction.atomic()` ichida UPDATE'ga aylantiradi → 500/dublikat yo'q.
  - **DB unique constraint OLIB TASHLANMADI** (`models.py:506` `unique_doctor_service_rate`
    saqlanib qoldi).
- **Test (TASDIQLANDI):** `test_doctor_naryad_patch_pair_change_rejected_not_500`
  (A biriktir → B biriktir → B'ni A'ga PATCH → 400, so'ng xavfsiz `custom_price` PATCH → 200),
  `test_doctor_naryad_repeat_post_is_idempotent` (takror POST → 1 qator),
  `test_doctor_naryad_concurrent_create_falls_back_to_update` (`IntegrityError` mock →
  endpoint UPDATE'ga o'tadi, 1 qator, 500 yo'q).
- **BAJARILMADI (muhit cheklovi):** HAQIQIY PostgreSQL ostida bir vaqtda ishlaydigan
  ikki jarayonli parallel assign sinovi — bu mashinada Docker/Postgres yo'q. Parallel
  poyga `IntegrityError` mock orqali SQLite'da model darajasida isbotlandi, lekin real
  DB izolyatsiya darajasidagi poyga serverda (Postgres) alohida tasdiqlanishi kerak.

### ③ Resetdan keyin eskirgan API xatosi yangi sessiyaga chiqardi → chiqmaydi
- **Fayllar:** `frontend/src/lib/http.ts`, `frontend/src/lib/patientRecords.ts`.
- **Sabab:** `patientRecords` da generation (sessiya avlodi) himoyasi bor edi, ammo
  `apiFetch` undan OLDIN `reportApiError` orqali global `dentos-save-state` eventini
  chiqarardi. Natijada reset'dan (logout/akkaunt almashish) oldin boshlangan PUT/GET ning
  500/tarmoq/409 xatosi yangi sessiyaga ko'rinardi.
- **Tuzatish:** `apiFetch`'ga `report` parametri (default `true`). Sessiyaga bog'liq
  qatlam (`patientRecords`) uni `false` beradi → xatoni KO'RSATISH mas'uliyati so'rovni
  boshlagan qatlamda; `ApiError` baribir tashlanadi va `catch` ichida `gen === generation`
  tekshiruvidan SO'NG `reportApiError` chaqiriladi. Faol sessiyaning haqiqiy xatolari
  yashirilmaydi (`report=false` faqat shu qatlam uchun; boshqa chaqiruvchilar default `true`).
  "Yuborilgan amal serverda bajarilmadi" degan kafolat berilmaydi (http.ts xabari o'zgarmas:
  "Ma'lumot saqlangan deb hisoblamang").
- **Test (TASDIQLANDI, real `http.ts` qatnashadi):**
  `reset then old PUT 500` (eskirgan 500 global chiqmaydi), `reset then old PUT network error`
  (eskirgan tarmoq xatosi chiqmaydi), `reset then old 409` (eskirgan 409 `failed` qoldirmaydi),
  `ACTIVE session PUT 500 DOES surface` (faol sessiya xatosi ODATDAGIDEK ko'rinadi).
  Avvalgi 4 test (in-flight PUT bekor, stale GET keshga yozmaydi, 409 failed, oddiy
  saqlash pending=0) ham o'tdi → jami 8/8.

## Bu bosqichda o'zgargan/qo'shilgan fayllar
```
backend/clinic/serializers.py            (① validate_naryad_id; ①/② validate() juftlik+klinika)
backend/clinic/views.py                  (② perform_create upsert + IntegrityError fallback)
backend/clinic/tests/test_security.py    (5 yangi doctor-naryad regressiya testi)
frontend/src/lib/http.ts                 (③ apiFetch report parametri)
frontend/src/lib/patientRecords.ts       (③ apiFetch report=false + gen-gated reportApiError)
frontend/tests/patientRecords.test.mjs   (③ 4 yangi deterministik test)
```
> Eslatma: yuqoridagi tuzatishlarning ayrimlari oldingi bosqich faylining ichida; model
> va migratsiyaga TEGILMADI (`unique_doctor_service_rate` va boshqa constraintlar o'z o'rnida).

## Bu bosqichda BAJARILMAGAN tekshiruvlar (halol ro'yxat)
- **Brauzerda qo'lda UI click-through** (login → bemor kartasi → saqlash → logout/login):
  BAJARILMADI. MCP Playwright/Chrome profili band; shu sinf xatoning semantikasi real
  `http.ts` qatnashadigan 8 deterministik test bilan qoplandi, ammo jonli brauzer oqimi
  alohida tasdiqlanmagan.
- **HAQIQIY PostgreSQL parallel/yuklama (soak) testi:** BAJARILMADI (Docker/Postgres yo'q).
  Parallel assign poygasi faqat mock `IntegrityError` bilan isbotlandi.
- "Faqat build o'tdi" degan asosда "to'liq tayyor" DEYILMAYDI: yuqoridagi ikki tekshiruv
  serverda/real muhitda qolmoqda.

---

# 3-BOSQICH (2026-10-28, tun) — katalog huquqi/validatsiya, sessiya bekor qilish, shifokor narxi

> Bu bo'lim eng SO'NGGI va ustun. 2-bosqichdan keyin mustaqil tekshiruvda topilgan
> 6 ta aniq kamchilik tuzatildi va regressiya testlari bilan mustahkamlandi.

## Natijalar qisqacha
- **Backend: 96/96 test** (86 + 10 yangi: katalog rol-gate, narx/foiz validatsiya,
  bulk import atomar/idempotent, shifokor-narxi persistensiya/izolyatsiya).
  `makemigrations --check`: toza (yangi migratsiya `0030`).
- **Frontend: `npm run build` + TypeScript — o'tdi.**
- **Frontend deterministik testlar: 4/4** (`frontend/tests/patientRecords.test.mjs`,
  Node 24 native TS + lokal resolve hook, tashqi framework YO'Q). `npm test` orqali.
- **Live-server HTTP tekshiruv** (ishlaydigan backend, SQLite): quyida band-bo'yicha
  " TASDIQLANDI" deb belgilangan.
- **Playwright UI click-through — BAJARILMADI**: MCP Chrome profili oldingi
  instansiya tomonidan qulflangan (`lockfile` band); foydalanuvchi Chrome
  jarayonlarini o'ldirmaslik uchun majburlamadim. A→B tez almashish UI testi shu
  sabab bajarilmadi (kod + build + review bilan qoplandi; shu sinf xatoning
  bekor-qilish semantikasi patientRecords deterministik testlarida isbotlangan).
- **PostgreSQL parallel/yuklama va Docker — avvalgidek yo'q** (bu mashinada).

## Band-bo'yicha

### #1 Katalog yozish huquqi backend'da cheklandi
- `access.py`: `/api/service-catalog/` va `/api/doctor-naryads/` uchun yozish
  (POST/PATCH/PUT/DELETE/bulk_import) faqat `director/deputy_director/admin`.
  Oddiy shifokor FAQAT o'qiydi. UI emas, **backend** darajasida.
- **TASDIQLANDI (live):** doctor POST `/service-catalog/` → **403** (avval 201 edi);
  doctor GET → 200. Test: `test_doctor_cannot_write_catalog_but_can_read`,
  `test_director_can_write_catalog`.

### #2 Noto'g'ri narx/foiz rad etiladi
- `ServiceCatalogItemSerializer`: `base_price >= 0`, `default_percent 0..100` —
  create VA update'da. `DoctorNaryadRateSerializer` ham. Model'da DB
  `CheckConstraint`lar (migr `0030`).
- **TASDIQLANDI (live):** `base_price=-100` → **400** (avval 201); `default_percent=150`
  → **400**; chegara `0`/`100` → 201. Test: `test_catalog_rejects_invalid_price_and_percent`,
  `test_catalog_update_also_validates`.

### #3 resetPatientRecords davom etayotgan ishni haqiqatan bekor qiladi
- `patientRecords.ts`: `generation` (sessiya avlodi) tokeni. Reset avlodni oshiradi;
  reset'dan oldin boshlangan GET/PUT javoblari yangi sessiya keshi/`failed`/`pending`'iga
  TEGMAYDI; eski navbatdagi yangi PUT boshlanmaydi; `pending` manfiy bo'lmaydi (gen-gated
  dekrement); allaqachon yuborilgan amal "bekor qilindi" deb yolg'on ko'rsatilmaydi.
- **TASDIQLANDI (deterministik):** `frontend/tests/patientRecords.test.mjs` 4 test:
  reset in-flight PUT (pending manfiy emas, yangi sessiya buzilmaydi), reset'dan keyin
  stale GET keshga yozmaydi, 409 "failed" chiqaradi (jim overwrite yo'q), oddiy saqlash
  pending=0 ga tushadi. Login/logout yo'li `auth.tsx` `resetPatientRecords()` bilan.

### #4 Shifokorga xos narx/foiz endi BAZADA
- Yangi `DoctorNaryadRate` modeli (klinika+shifokor+xizmat, unique), serializer
  (bog'langan shifokor/xizmat shu klinikaga tegishli bo'lishi tekshiriladi),
  `DoctorNaryadRateViewSet` (`/api/doctor-naryads/`, upsert create — "assign" idempotent),
  migr `0030`. Frontend `getDoctorNaryads/assign/update/remove` async+backend;
  consumerlar: `staff/[id]`, `NaryadModal` (custom_price), `naryads`.
- **TASDIQLANDI (live):** rate yaratildi (201) → **yangi sessiyada ko'rindi** (custom_price
  1250000) → qayta assign idempotent (1 qator) → begona klinika ko'rmaydi.
  Test: `test_doctor_naryad_rate_persists_and_isolated`,
  `test_doctor_naryad_rate_rejects_foreign_doctor_or_service`,
  `test_doctor_cannot_write_doctor_naryad_rate`.
- **Eski `nar-*` bog'lanishlar:** yangi backend ID'lari `String(pk)`; eski localStorage
  `nar-*` ID'lar backend xizmatiga mos kelmaydi — avtomatik O'CHIRILMAYDI, nazoratli
  import orqali ko'chiriladi (quyida).

### #5 Katalog importi atomar/idempotent + ochiq xato
- Backend `POST /api/service-catalog/bulk_import/`: bitta tranzaksiya (ATOMAR); nomi
  mavjud xizmat o'tkazib yuboriladi (IDEMPOTENT — takror dublikat yaratmaydi);
  `{created, skipped}` qaytaradi. Frontend `importNaryadCatalog(source)`: `local` —
  eski lokal ma'lumot topilmasa/buzilgan bo'lsa ANIQ xato (standart narxga YASHIRIN
  o'tmaydi); `default` — ochiq tanlov (narx 0).
- **Chalg'ituvchi argumentlar olib tashlandi:** `getNaryadCatalog/create/update/delete`
  endi `clinicId` olmaydi (server sessiya bo'yicha scoping qiladi); barcha chaqiruvchilar
  moslandi.
- **TASDIQLANDI (live):** bitta xato element → butun import **400**, "good" element ham
  yozilmaydi (rollback). Test: `test_bulk_import_is_idempotent`,
  `test_bulk_import_is_atomic_on_error`, `test_bulk_import_doctor_denied_and_clinic_scoped`.

### #6 Bemor A→B async race yopildi
- `patients/[id]/page.tsx` `loadPatient`: endi HAR bir `await`dan keyin `if (cancelled)
  return` — A sekin yuklanayotganda B ga o'tilsa, A natijasi (patient/photoDoc/lab/…)
  B ekraniga yozilmaydi. `loadedPlans` bo'sh bo'lsa real klinikada endi ANIQ
  `else { setTreatmentPlans([]) }` — oldingi bemor rejasi qolib ketmaydi. Oddiy
  ochish/reload yozuv yubormasligi (2-bosqich) saqlanadi.
- **Tekshiruv:** kod + production build + review. UI A/B click-through Playwright
  qulfi tufayli bajarilmadi (yuqorida). Bekor-qilish semantikasi #3 testlarida isbotlangan.

## 3-bosqichda o'zgargan asosiy fayllar
```
backend/clinic/access.py                 (#1 katalog/rate yozish rol-gate)
backend/clinic/models.py                 (#2 CheckConstraintlar; #4 DoctorNaryadRate)
backend/clinic/serializers.py            (#2 validatsiya; #4 DoctorNaryadRateSerializer)
backend/clinic/views.py                  (#4 DoctorNaryadRateViewSet upsert; #5 bulk_import atomar)
backend/clinic/urls.py                   (/doctor-naryads/)
backend/clinic/migrations/0030_*.py      (YANGI — constraintlar + DoctorNaryadRate)
backend/clinic/tests/test_security.py    (+10 test)
frontend/src/lib/patientRecords.ts       (#3 generation/cancellation)
frontend/src/lib/http.ts                 (ApiError param-property → oddiy maydon, test uchun ham)
frontend/src/lib/api.ts                  (#4 doctor-naryads backend; #5 import atomar + clinicId args olib tashlandi)
frontend/src/app/patients/[id]/page.tsx  (#6 cancelled-guard har await; plans else)
frontend/src/app/staff/[id]/page.tsx     (#1/#4 async doctor-naryad + xato qaytarish)
frontend/src/app/naryads/page.tsx        (import {created,skipped}; clinicId args olib tashlandi)
frontend/src/components/NaryadModal.tsx  (async doctor-naryads)
frontend/tests/patientRecords.test.mjs   (YANGI — 4 deterministik test)
frontend/tests/ts-resolve.mjs            (YANGI — lokal ESM resolve hook, testlar uchun)
frontend/package.json                    ("test" skripti)
```

## 3-bosqichda QOLGAN / BAJARILMAGAN (aniq)
- Playwright UI click-through va A→B tez almashish UI testi — MCP Chrome profili qulfi.
- PostgreSQL parallel/yuklama (soak) va Docker Compose/backup-restore — muhitда yo'q.
- Ichki `32desk_*` localStorage kalit nomlari — ataylab o'zgartirilmagan (keng refaktor
  + ma'lumot yetim qolishi; brendга ta'sir qilmaydi). Eski `nar-*` doctor-naryad
  bog'lanishlari faqat nazoratli import orqali ko'chiriladi.

---

# 2-BOSQICH (2026-10-28, kechqurun) — brauzer xatolari va katalog persistensiyasi

> Bu bo'lim eng SO'NGGI va ustun hisoblanadi. Quyida 1-bosqichdan keyin topilgan
> aniq muammolar va ularning yechimi. Test/build o'tgani bilan topilgan brauzer
> xatolari ham shu yerda yopildi.

## Natijalar qisqacha
- **Backend: 86/86 test o'tadi** (80 + 6 yangi: katalog persistensiya/izolyatsiya ×2,
  `create_admin` ×4). `makemigrations --check`: toza.
- **Frontend: `npm run build` (Next 15.5.28) muvaffaqiyatli, TypeScript toza.**
- **Real HTTP runtime smoke (ishlaydigan server, SQLite):** login→`/auth/me`→scoped
  `patients`→`service-catalog` CREATE(201)/PATCH(200)/re-GET(narx saqlangan)→
  klinikalararo izolyatsiya (boshqa klinika kataloghi `[]`, bizning item PATCH→404)→
  `patient-records` versiya (v0→200, stale v0→409)→logout→`me`→401. Hammasi ✓.
- **Playwright UI click-through BAJARILMADI** — sabab: MCP Chrome profili oldingi
  instansiya tomonidan qulflangan (`lockfile` band), foydalanuvchining Chrome
  jarayonlarini o'ldirmaslik uchun majburan ochmadim. O'rniga butun API yo'li
  yuqoridagi REAL HTTP smoke bilan tekshirildi.
- **PostgreSQL parallel/yuklama testi BAJARILMADI** — bu mashinada Postgres ham,
  Docker ham yo'q (psql topilmadi, 5432 yopiq). Versiya-konflikt kafolati
  (ikki xodim parallel tahrir → biri 409, jim overwrite yo'q) SQLite'da
  deterministik test bilan qoplangan (`test_patient_record_version_conflict`),
  lekin haqiqiy satr-bloklash (`select_for_update`) va yuklama chegarasi faqat
  Postgres muhitida sinaladi. Sinov hajmi: 1 klinika, bir nechta ketma-ket
  so'rov — bu "katta yuklamada qotmaydi" degani EMAS.

## Band-bo'yicha

### 1. Naryad/xizmat narx katalogi → BAZADA (localStorage o'rniga)
- **Nima tuzatildi:** katalog endi `ServiceCatalogItem` modeli orqali PostgreSQL/
  bazada, klinika bo'yicha scoping. Narx o'zgartirish → reload → boshqa sessiyada
  ayni narx ko'rinadi (HTTP smoke bilan tasdiqlandi).
- **Fayllar:** `backend/clinic/models.py` (yangi `ServiceCatalogItem`),
  `serializers.py`, `views.py` (`ServiceCatalogItemViewSet`, clinic-scoped),
  `urls.py` (`/api/service-catalog/`), migratsiya `0028_servicecatalogitem.py`;
  `frontend/src/lib/api.ts` (`getNaryadCatalog`/`create`/`update`/`delete` endi
  async + backend; `importNaryadCatalog` nazoratli import; `initClinicWithZeroPrices`
  endi no-op — yangi klinika BO'SH boshlaydi, serverga avto-yozilmaydi),
  `app/naryads/page.tsx` (async CRUD + xato toastlari + bo'sh holatda "eski
  narxlarni import" / "standart ro'yxat" tugmalari), `components/NaryadModal.tsx`,
  `app/staff/[id]/page.tsx`, `app/super-admin/page.tsx`.
- **Tekshiruv:** backend `test_catalog_persists_and_is_clinic_scoped`,
  `test_catalog_cross_clinic_write_blocked`; HTTP smoke (yuqorida).
- **Q/B (nazoratli import):** eski localStorage narxlari avtomatik serverga
  yozilmaydi — direktor naryadlar sahifasida tugma orqali import qiladi. Server
  xatosida lokal "muvaffaqiyat" ko'rsatilmaydi (write'lar `apiFetch` → xatoda throw).
- **Demo:** o'zgarmadi — demo'da hardcoded `DEFAULT_NARYAD_CATALOG` ko'rsatiladi,
  saqlanmaydi.

### 2. Sozlamalar sahifasi yopilgan WhatsApp API'ni chaqirmaydi
- **Nima tuzatildi:** `settings/page.tsx`da ochilish paytidagi avtomatik
  `whatsappGetConfig()` chaqiruvi OLIB TASHLANDI (ushlanmagan 503 ApiError butun
  ilovaga yopishib qolgan bannerni chiqarardi). `saveWaConfig` endi try/catch/finally
  bilan — `waSaving` osilib qolmaydi. UI'da WhatsApp allaqachon "🚧 ishlab chiqilmoqda"
  va tugmasi o'chirilgan. Backend 503 cheklovi OLINMADI.
- **Fayl:** `frontend/src/app/settings/page.tsx`.

### 3. Bemor kartasi ochilganda fantom yozuvlar yo'q
- **Nima tuzatildi:** hydration va foydalanuvchi tahriri aniq ajratildi. Saqlash
  effektlari (xrays/photoDoc/comms/tgchat) endi faqat shu bemor to'liq yuklangach
  va keyingi makrotaskda yoqiladi (`hydratedPatientIdRef` + `setTimeout`), shu
  tufayli oddiy ochish/reload bazaga yozuv YUBORMAYDI. Bemor almashganda eski
  karta qiymati yangisiga yozilmaydi (gate `null`ga tushadi, so'ng yangi id'ga
  bog'lanadi). Real klinikada **namuna task avtomatik yaratilmaydi** (faqat demo).
- **Fayl:** `frontend/src/app/patients/[id]/page.tsx`.
- **Eslatma:** fantom yozuvlar yo'qolgani uchun ochishdagi parallel yozuv/
  `database is locked` manbai ham yo'qoldi.

### 4. Sessiya va sahifa almashish
- **Nima tuzatildi:**
  - `auth.tsx` — init'da localStorage'dan optimistik, so'ng `/auth/me` bilan
    MOSLASH: cookie yo'q/eskirgan bo'lsa (401) foydalanuvchi chiqariladi (soxta
    "kirilgan" holat yo'q); tarmoq xatosida mavjud holat buzilmaydi. Logout endi
    saqlanmagan o'zgarishlar bo'lsa ogohlantiradi va `resetPatientRecords()` bilan
    eski akkaunt navbatlarini tozalaydi.
  - `branchContext.tsx` — auth tayyor/foydalanuvchi bo'lmaguncha `/api/branches/`
    chaqirMAYDI (login sahifasidagi 401 yo'qoldi).
  - `patientRecords.ts` — `resetPatientRecords()` qo'shildi (logout/akkaunt
    almashishida navbat/xato/counter tozalanadi). 409 konflikt jim overwrite
    qilmaydi (avvaldan).
  - `SaveStatus.tsx` — sog'lom holatga qaytganda eski xato tozalanadi (boshqa
    sahifada stale "saqlanmadi" qolmaydi).
- **Fayllar:** `frontend/src/lib/auth.tsx`, `lib/branchContext.tsx`,
  `lib/patientRecords.ts`, `components/SaveStatus.tsx`.

### Docker/domenlar (qayta tekshirildi — statik)
- `deploy/Caddyfile`: `backend.dentos.cc` → `backend:8000` (to'liq); `dentos.cc` →
  `/api,/admin,/static` backendga, qolgani frontendga. Brauzer `/api` orqali
  dentos.cc'dan ayni Django'ga boradi (cookie + yopiq media o'zgarmadi). ✓
- `docker-compose.yml`: `BACKEND_DOMAIN` default `backend.dentos.cc`; faqat Caddy
  80/443; db/8000/3000 tashqariga ochilmagan; healthcheck; `restart: unless-stopped`;
  backend `--workers 1` (Telegram uchun bitta process). ✓
- `.env.example`: `ALLOWED_HOSTS=dentos.cc,backend.dentos.cc,localhost,127.0.0.1`,
  `NEXT_PUBLIC_API_URL=/api`. ✓
- `next.config.mjs`: `outputFileTracingRoot` (standalone uchun) + `node:url` import. ✓
- `backend/entrypoint.sh`: migrate/collectstatic `START_BACKGROUND_SERVICES=false`
  bilan (Telegram tinglovchilari migratsiya vaqtida ishlamaydi). ✓
- `deploy/backup.sh`: baza + `media` + `telegram_media` + `runtime` arxivi, yozuvchilarni
  vaqtincha to'xtatish/qayta boshlash (`trap`), checksum (`SHA256SUMS`). ✓
- `.gitattributes`: `*.sh`/`Dockerfile` → LF. ✓
- **Docker Compose up/build/smoke BAJARILMADI** — Docker bu mashinada yo'q.

### Production bootstrap (seed_platform xavfi)
- **Nima qilindi:** yangi `python manage.py create_admin` buyrug'i. Parol faqat
  `DJANGO_ADMIN_PASSWORD` env'dan (argumentda emas, logga/chatga chiqmaydi), kuch
  tekshiruvi bilan; mavjud akkaunt avtomatik ALMASHTIRILMAYDI (`--reset-password`
  talab); namuna klinika YARATMAYDI. `seed_platform` (hardcoded parol + demo
  klinikalar) productionda ishlatilmasin.
- **Fayl:** `backend/clinic/management/commands/create_admin.py`.
- **Tekshiruv:** `CreateAdminCommandTests` (parol env majburiy, zaif parol rad,
  superadmin hashlab yaratiladi, mavjudni almashtirmaydi).

### Brend nomi: 32desk → Dentos
- **Nima qilindi:** foydalanuvchiga KO'RINADIGAN "32Desk" satrlari Dentos qilindi:
  `locales/{uz,ru,en}.ts` (login sarlavhasi, resepshn), `mockData.ts` (demo klinika
  yorlig'i), `backend` `PlatformSetting.clinic_name` default (+ migratsiya `0029`),
  `views.py` fallback, `ai_agent.py`/`seed_data.py` matnlari, `auth.tsx` izoh.
- **ATAYLAB QILINMADI:** ichki `32desk_*` localStorage kalitlari (~50 kalit, 193
  joyda) O'ZGARTIRILMADI. Sabab: (a) bu "keng refaktor" — topshiriq taqiqlagan;
  (b) kalitlarni almashtirish mavjud lokal ma'lumotni (kesh/qoralama) yetim qilib
  qo'yadi — "lokal ma'lumot avtomatik yo'qolmasin" qoidasiga zid; (c) kalitlar
  foydalanuvchiga ko'rinmaydi ("programma nomi" emas). Kerak bo'lsa, keyingi
  bosqichda bir martalik `32desk_* → dentos_*` ko'chirish migratsiyasi bilan
  (ma'lumot yo'qotmasdan) qilish mumkin.

## 2-bosqichda o'zgargan fayllar
```
backend/clinic/models.py                 (ServiceCatalogItem + clinic_name default)
backend/clinic/serializers.py            (ServiceCatalogItemSerializer)
backend/clinic/views.py                  (ServiceCatalogItemViewSet + clinic_name fallback)
backend/clinic/urls.py                   (/api/service-catalog/)
backend/clinic/ai_agent.py               (brend matni)
backend/clinic/management/commands/create_admin.py   (YANGI — xavfsiz bootstrap)
backend/clinic/management/commands/seed_data.py      (brend matni)
backend/clinic/migrations/0028_servicecatalogitem.py (YANGI)
backend/clinic/migrations/0029_alter_platformsetting_clinic_name.py (YANGI)
backend/clinic/tests/test_security.py    (+6 test: katalog, create_admin)
frontend/src/lib/api.ts                  (katalog backend + import)
frontend/src/lib/auth.tsx                (/auth/me moslash + logout guard/reset)
frontend/src/lib/branchContext.tsx       (auth-gate)
frontend/src/lib/patientRecords.ts       (resetPatientRecords)
frontend/src/components/SaveStatus.tsx   (stale error tozalash)
frontend/src/components/NaryadModal.tsx  (async katalog)
frontend/src/app/patients/[id]/page.tsx  (fantom yozuv/gate + demo-only sample task)
frontend/src/app/settings/page.tsx       (WhatsApp auto-call olib tashlandi)
frontend/src/app/naryads/page.tsx        (async CRUD + import UI)
frontend/src/app/staff/[id]/page.tsx     (await katalog)
frontend/src/app/super-admin/page.tsx    (initClinicWithZeroPrices olib tashlandi)
frontend/src/lib/locales/{uz,ru,en}.ts   (brend)
frontend/src/lib/mockData.ts             (demo yorliq brend)
```

## 2-bosqichda QOLGAN / BAJARILMAGAN (aniq)
- Playwright UI click-through — MCP Chrome profili qulfi tufayli (yuqorida). Keyingi
  bosqichda toza muhitda bajarilsin.
- PostgreSQL parallel/yuklama (soak) testi — Postgres/Docker yo'q. Serverda
  `select_for_update` ostida 2+ parallel yozuvchi va yuklama chegarasi sinalsin.
- Docker Compose up/build/smoke va backup→restore — Docker yo'q.
- Ichki `32desk_*` localStorage kalit nomlari (ataylab o'zgarmagan, yuqorida).

---

## 1-BOSQICH (oldingi) — asl topshiruv

## 1. Shu bosqichda nima qilindi

### Tuzatilgan kod o'zgarishlari (bu agent)

| Fayl | O'zgarish | Sabab |
|---|---|---|
| `frontend/src/lib/api.ts` | `API_BASE` default `http://127.0.0.1:8000/api` → `/api` | Brauzerda `127.0.0.1` reverse-proxy'ni chetlab o'tar, productionda buziladi. Endi hamma joyda `/api` (dev'da Next rewrite, prod'da Caddy proxy). |
| `frontend/src/components/TelegramLoginForm.tsx` | `API` default → `/api` | Yuqoridagi bilan bir xil nomuvofiqlik. |
| `frontend/src/components/KeynoteDentalPhotoProtocol.tsx` | 3 ta `http://127.0.0.1:8000/api/media-sample/...` → `/api/media-sample/...` | Demo namuna rentgen/skan havolalari absolyut edi. |
| `frontend/src/app/settings/page.tsx` | WhatsApp webhook URL default `127.0.0.1` o'rniga brauzer origin'idan olinadi | WhatsApp (legacy) webhook ko'rsatishi uchun. |
| `frontend/src/lib/auth.tsx` | `logout()` endi `async` — server `/auth/logout/` POST **kutib** keyin redirect | Avval `void apiFetch(...)` qilib darhol redirect qilardi; sessiya cookie'sini o'chiruvchi javob qabul qilinmay qolishi mumkin edi. Tarmoq uzilsa ham local sessiya tozalanadi. |
| `backend/clinic/dev.ps1` | Lokal ishga tushirishda `$env:DEBUG="True"` qo'shildi | `.env` productionga moslangan (`DEBUG=False`) → `dev.ps1` SQLite rejimida "Production requires PostgreSQL" himoyasiga urilib ishlamay qolardi. |
| `backend/clinic/tests/test_security.py` | **Yangi** — 20 ta auth/izolyatsiya/idempotentlik/versiya testi | Pastda 4-bo'limga qarang. |

### Oldingi agent ishini tekshirish natijasi (tasdiqlangan, o'zgartirilmagan)

Quyidagilar o'qib tekshirildi va **to'g'ri ishlashi tasdiqlandi**:

- **`access.py` (AccountMiddleware + TenantPermission)** — cookie (`dentos_session`,
  `signing.dumps`, httponly, 12 soat) autentifikatsiya; yozishda `X-Dentos-Request`
  header + Origin allowlist (CSRF); `clinic` query/`X-Clinic-ID` header boshqa
  klinikaga mos kelsa 403; demo (id=1) faqat o'qish; rol cheklovlari (kassa/telegram/
  platforma); texnik faqat `lab-orders`/`technicians`/`auth`.
- **`views.py` TenantViewSet.get_queryset** — superadmin hammasi; texnik faqat o'z
  `lab-orders`/profili; boshqa har bir model `clinic_id=user.clinic_id` bilan filtr;
  klinika aniqlanmasa `none()` (boshqa klinika oqib ketmaydi).
- **`tenant_serializers.py`** — `password`/`telegram_bot_token` write-only; `user`
  read-only; `clinic` majburan foydalanuvchi klinikasiga; **bog'langan FK obyektlar**
  (`patient`/`doctor`/`branch`/`technician`) ham shu klinikaga tegishli bo'lishi
  tekshiriladi; parol hashlanmagan bo'lsa `make_password`.
- **`record_payment` (views.py:541)** — `transaction.atomic` + `select_for_update`;
  `request_id` (UUID, DB'da `unique`) bilan **idempotent**; takroriy so'rov bir
  to'lovni ikki marta yozmaydi; boshqa summa bilan bir `request_id` → 409.
- **Frontend `recordPayment` (api.ts:1851)** — real klinikada backend `record_payment`
  muvaffaqiyatli bo'lsa **darhol `return`** qiladi; `createTransaction` (ikkinchi
  yozuv) faqat demo yo'lida chaqiriladi. **Kassaga ikki marta yozilish YO'Q.**
- **`patient_records.py`** — `PatientRecord` optimistik versiya; mijoz eski
  `version` yuborsa 409 "Boshqa xodim o'zgartirdi"; bo'sh frontend holati bazani
  ustidan yozmaydi (versiya mos kelmasa rad).
- **`photo_assets.persist_images`** — base64 rasmlar `PatientMedia`ga alohida fayl
  bo'lib ko'chiriladi (JSON ichida shishmaydi); `blob:` rad; tur/hajm (10MB) va
  klinika kvotasi tekshiriladi; boshqa bemor fayliga havola rad.
- **`PatientMediaViewSet.download`** — `FileResponse` orqali **autentifikatsiyalangan
  proxy**; B2 kaliti yoki doimiy public URL brauzerga chiqmaydi; `Cache-Control:
  private, no-store`. Fayl klinika bo'yicha scoping.
- **`http.ts`** — xato bo'lsa `ApiError` tashlaydi va `dentos-save-state` event
  chiqaradi; faqat demo'da yutiladi. `api.ts`dagi ~138 `catch` blok bir xil
  qoidaga amal qiladi: `if (e instanceof ApiError && !isDemoClinic()) throw e`.
- **Migratsiyalar `0026` (PatientRecord + unique patient/section) va `0027`
  (FinancialTransaction.request_id unique)** — model bilan mos; `makemigrations
  --check` toza (yangi migratsiya kerak emas).

---

## 2. Testlar — o'tganlar / bajarilmaganlar

### O'tdi ✅

- **Backend: 80/80 test** (`python manage.py test --settings=core.test_settings`).
  - Eski 60 ta (reception, telegram login, reception account) — o'zgarmadi, o'tadi.
  - **Yangi 20 ta** (`test_security.py`, `ENFORCE_API_AUTH=True` bilan):
    - autentifikatsiyasiz 401; login→me→logout sikli; cookie o'chishi;
    - noto'g'ri parol 400 + parol hash javobda chiqmaydi;
    - yozishda CSRF header majburiy; begona Origin 403;
    - ro'yxat faqat o'z klinikasi; `?clinic=` va `X-Clinic-ID` override 403;
    - begona klinika obyektini o'qish/yozish 404; create begona klinikaga 400/403;
    - bog'langan (boshqa klinika doctor) obyekt rad;
    - media download klinika bo'yicha (egasi 200, begona 404);
    - to'lov `request_id` idempotent; bir `request_id` boshqa summa 409;
    - to'lov faqat kassa/director roli; `PatientRecord` versiya 409 to'qnashuvi;
    - texnik faqat `lab-orders` ko'radi, `patients` 403.
- **Frontend: `npm run build` (Next 15.5.28) — muvaffaqiyatli** (exit 0),
  "Compiled successfully" + "Checking validity of types" (TypeScript tekshirildi,
  xato yo'q). Bu `logout: () => Promise<void>` o'zgarishini ham qamradi.
- **`manage.py check`** — test_settings va lokal (DEBUG=True+SQLite) rejimida toza.

### Bajarilmadi / cheklangan ⚠️

- **Docker Compose / build / smoke test — BAJARILMADI.** Bu muhitda `docker`
  o'rnatilmagan. Faqat **statik ko'rib chiqildi** (pastda 5-bo'lim). "Docker
  ishlashi tekshirildi" deb hisoblamang.
- **Real Telegram jonli test — BAJARILMADI** (AGENTS.md: jonli xabar faqat
  ataylab, aniq qabul qiluvchi va matn tasdiqlangandan keyin). Telegram oqimi
  faqat izolyatsiyalangan/mock testlar bilan tekshirilgan (test_telegram_login,
  test_reception*).
- **npm audit `fix` — BAJARILMADI** (pastda 5-bo'lim, breaking).
- **Lokal `db.sqlite3` migratsiyasi — BAJARILMADI** (pastda "Qolgan ishlar").

---

## 3. Rentgen / foto / skan va B2 oqimi

### Mo'ljallangan oqim (kod shunga mos)

```
CRM brauzer  ──(multipart/base64, cookie-auth)──►  Django server
                                                      │
                                      metadata (PatientMedia/PhotoProtocol) → PostgreSQL
                                                      │
                                      fayl bytes → STORAGES['default']
                                                      ├─ MEDIA_STORAGE=local → disk (/app/media)  ◄── HOZIR
                                                      └─ MEDIA_STORAGE=b2    → private B2 (S3)     ◄── O'CHIRILGAN
Yuklab olish:  brauzer ─► /api/patient-media/<id>/download/ ─► Django FileResponse (proxy)
```

- **B2 kaliti faqat serverda.** Brauzerga kalit yoki doimiy public URL
  berilmaydi — hamma fayl autentifikatsiyalangan Django proxy (`download`) orqali.
- Tekshiruvlar: foydalanuvchi+klinika huquqi (scoped queryset), fayl turi/hajmi
  (`MAX_PATIENT_FILE_BYTES`, default 512MB), klinika kvotasi
  (`storage_quota_gb`), `max_memory_size=8MB` (katta fayl RAM'da ushlanmaydi).

### ⚠️ B2 bucket nomi nomuvofiqligi (MUHIM — hujjatlashtirildi)

- `settings.py` default: `B2_BUCKET_NAME='dentos'`, region `eu-central-003`.
- **Lekin oldingi bulut bosqichida yaratilgan bucket nomi `dentical`** va mavjud
  B2 application key **o'sha `dentical` bucketga cheklangan**.
- `.env`ga `B2_BUCKET_NAME=dentos` yozish **mavjud bucket yoki kalitni
  o'zgartirmaydi** — kalit `dentical`ga bog'langani uchun `dentos` bilan
  ulanish rad etiladi.
- Bu bosqichda **bulutda yangi bucket/kalit yaratilmadi, eskisi o'chirilmadi.**
  Keyingi bosqichda qaror: (a) kalitni `dentos` bucketga qayta cheklash yoki yangi
  `dentos` bucket+kalit yaratish, YOKI (b) `.env`da `B2_BUCKET_NAME=dentical`
  qoldirish. Qaysi birini tanlasangiz — `.env` va bulut **mos** bo'lishi shart.

### ⚠️ B2 hozir YOQILMAGAN va yoqilmasin

- `B2_MEDICAL_STORAGE_APPROVED=false` — **shu holatda qolishi kerak.**
  `storage.PrivateB2Storage` approval bo'lmasa `ImproperlyConfigured` tashlaydi.
- O'zbekiston qonunchiligi bo'yicha tibbiy ma'lumotni xorijiy (EU Central)
  serverga ko'chirish mosligi **tasdiqlanmagan**. Real bemor ma'lumotini B2'ga
  (yoki umuman xorijiy serverga) **ko'chirmang**.
- Integratsiya faqat **mock storage** (`InMemoryStorage`) va sun'iy fayllar bilan
  tekshirilgan (test_security media testi). Real B2'ga hech narsa yuborilmadi.

---

## 4. Telegram

- Loyiha qoidasi (AGENTS.md): bemor bilan yozishma klinikaning ulangan **akkaunti**
  (Telethon) orqali; login boti faqat CRM kirish uchun; yangi bemor boti YO'Q.
  Kod shunga mos (`telegram_auth.py` Telethon StringSession; `telegram_login.py`
  faqat login boti).
- Sessiyalar `RUNTIME_DIR/telegram_sessions.json` (+`telegram_pending.json`) da →
  compose'da `runtime` volume (`/app/runtime`) → **Docker restartda saqlanadi**.
- Bir sessiyani bir jarayon boshqaradi: backend `gunicorn --workers 1`
  (entrypoint.sh), `login-bot` alohida profil. **Parallel egalik yo'q.**
- Telefon prefiksidan vaqt zonasi taxmin qilinmaydi (AGENTS.md qoidasi).
- Mavjud izolyatsiyalangan testlar o'tadi (kod/parol xatosi, timeout, cooldown,
  qalbaki kontakt rad, bir martalik kod, sessiya egaligi). **Jonli test
  qilinmadi** — kerak bo'lsa avval aniq qabul qiluvchi + matn tasdiqlang.

---

## 5. Docker va deploy konfiguratsiyasi (statik ko'rib chiqildi)

- `docker-compose.yml`: `db` (postgres:16, port **ochilmagan**), `backend`
  (`expose: 8000`, port yo'q), `frontend` (`expose: 3000`, port yo'q), `proxy`
  (Caddy, faqat `80/443` + `443/udp`). ✅ Faqat 80/443 tashqariga chiqadi.
- `backend` healthcheck `/api/health/` (X-Forwarded-Proto https bilan). `db`
  healthcheck `pg_isready`. Barcha xizmatlarda log limiti `10m × 3`. ✅
- Volume'lar doimiy: `pgdata`, `media`, `telegram_media`, `runtime`, `caddy_data`,
  `caddy_config`. ✅
- `entrypoint.sh`: `RUN_MIGRATIONS=true` bo'lsa `migrate`+`collectstatic`;
  gunicorn `--workers 1 --threads 8` (Telegram sababli worker ko'paytirilmagan). ✅
- Dockerfile'lar: backend `python:3.12-slim`, non-root `dentos` (uid 10001);
  frontend `NEXT_PUBLIC_API_URL=/api` build-arg bilan baked, non-root `node`. ✅
- `deploy/Caddyfile`: `/api/* /admin/* /static/*` → backend; qolgani → frontend;
  `request_body max_size 520MB` (512MB fayl + overhead); xavfsizlik header'lari. ✅

### ⚠️ Backup kamchiligi (hujjatlashtirildi)

`deploy/backup.sh` **faqat PostgreSQL** dump oladi (`pg_dump -Fc`, readable
tekshiruvi bilan). To'liq tiklash uchun quyidagilar **yetishmaydi**:

1. **`media` volume** (`/app/media`) — bemorlarning foto/rentgen/skan fayllari.
   Baza faqat metadata saqlaydi; fayllarsiz havolalar buziladi.
2. **`telegram_media` volume** (`/app/telegram_media`) — Telegram chatdagi yuklab
   olingan media.
3. **`runtime` volume** (`/app/runtime`) — **Telegram Telethon sessiyalari**
   (`telegram_sessions.json`). Busiz tiklashdan keyin har klinika Telegram
   akkauntini qayta ulashi kerak.

Keyingi bosqich tavsiyasi: backup skriptiga shu 3 volume'ning arxivini qo'shish
(masalan `docker run --rm -v <vol>:/v -v $PWD/backups:/b alpine tar czf
/b/<vol>-$stamp.tgz -C /v .`). Real ma'lumotni tashqi serverga **yuklamang**
(hozir qonuniy moslik tasdiqlanmagan).

### ⚠️ npm audit (hujjatlashtirildi, `fix` qilinmadi)

7 ta ogohlantirish (2 moderate, 5 high) — hammasi **PostCSS** va **source-map-js**,
bular Next.js **build-vaqti** toolchain'ining tranzitiv bog'liqliklari (production
standalone server runtime'da ishlamaydi). `npm audit fix --force` **next@16.4.3**
(breaking) o'rnatadi — **qilinmadi**. Next 16'ga ko'chirish alohida, sinovli
bosqich bo'lishi kerak. Runtime xavfi juda past.

---

## 6. Environment o'zgaruvchilari (maxfiy qiymatlarSIZ)

`.env.example` to'liq namuna. Productionda majburiy:

| O'zgaruvchi | Izoh |
|---|---|
| `SECRET_KEY` | ≥50 belgi, noyob (`django-insecure`/`change-me` bilan boshlanmasin — settings tekshiradi). |
| `DEBUG` | `False` (production). Lokal uchun `dev.ps1` avtomatik `True` qiladi. |
| `ALLOWED_HOSTS` | Aniq ro'yxat, masalan `dentos.cc,localhost,127.0.0.1` (`*` productionda rad etiladi). |
| `POSTGRES_DB/USER/PASSWORD` | Postgres. Productionda SQLite'ga tushib qolmaydi (settings himoyasi). |
| `POSTGRES_HOST/PORT` | Docker'da `db`/`5432`. |
| `CORS_ALLOWED_ORIGINS` | Masalan `https://dentos.cc`. |
| `DOMAIN` | Caddy uchun, default `dentos.cc`. |
| `ACME_EMAIL` | Let's Encrypt (Caddy majbur qiladi). |
| `TELEGRAM_API_ID/HASH` | Telethon (akkaunt ulash). |
| `TELEGRAM_LOGIN_BOT_TOKEN` | Login boti. **Hech qachon `NEXT_PUBLIC_*` qilmang.** |
| `TELEGRAM_LOGIN_BOT_USERNAME` | default `dentosccbot`. |
| `MEDIA_STORAGE` | `local` (hozir). B2 uchun `b2` — lekin quyidagi shartlarsiz YO'Q. |
| `B2_MEDICAL_STORAGE_APPROVED` | **`false` qolsin.** |
| `B2_KEY_ID`/`B2_APPLICATION_KEY` | **Faqat serverda.** B2 konsolidan olinadi; brauzerga/log'ga chiqmasin. |
| `B2_BUCKET_NAME` | 3-bo'limdagi `dentos` vs `dentical` nomuvofiqligiga qarang. |
| `B2_REGION`/`B2_ENDPOINT` | `eu-central-003` / `s3.eu-central-003.backblazeb2.com`. |
| `MAX_PATIENT_FILE_BYTES` | default 512MB. |
| `START_BACKGROUND_SERVICES` | `true` (backend), `false` (login-bot, test). |

> Qaysi kalit qayerdan: `TELEGRAM_API_ID/HASH` → my.telegram.org; `TELEGRAM_LOGIN_BOT_TOKEN`
> → @BotFather; `B2_KEY_ID/APPLICATION_KEY` → Backblaze B2 konsoli (bucket'ga cheklangan
> application key). Hammasi server `.env`iga (yoki secret manager'ga) yoziladi, repoga EMAS.

---

## 7. Qolgan aniq muammolar va keyingi bosqich (server) ishlari

### Kodga tegishli qolgan kichik kuzatuvlar

- `api.ts` fotoprotokol saqlashda (`savePatientPhotoDoc`, real klinika) xatoni
  `reportApiError` orqali bildiradi, lekin "fire-and-forget" (await emas) —
  banner ko'rinadi, ammo alohida saqlash holati kutilmaydi. PhotoProtocolStudio'ning
  o'z saqlash yo'li bor. Katta xavf emas; kerak bo'lsa keyin `await` qilinadi.
- URLconf import paytida `reminders.start_scheduler()` + `telegram_auth.start_listeners()`
  yon-ta'sir sifatida ishga tushadi (`START_BACKGROUND_SERVICES` bilan himoyalangan).
  Lokal `db.sqlite3` eski bo'lgani uchun "demo week seed error: ... request_id"
  (yutilgan, zararsiz) chiqadi — bu faqat lokal baza migratsiya qilinmagani sababli.
- Lokal `db.sqlite3` 0026/0027 migratsiyalarini olmagan. Lokal to'liq ishlatish
  uchun: `cd backend && python manage.py migrate` (SQLite dev bazasi; **real
  klinika bazasi EMAS**). Men ruxsatsiz migratsiya qilmaslik uchun tegmadim.

### Keyingi server bosqichida bajariladigan ishlar + tekshirish mezoni

1. **`.env` real qiymatlar bilan to'ldirish** (6-bo'lim). Mezon: `DEBUG=False`,
   `ALLOWED_HOSTS` aniq, `SECRET_KEY` kuchli — `manage.py check --deploy` ogohlantirishsiz.
2. **Docker Compose up + smoke test** (sun'iy ma'lumot bilan). Mezon:
   `docker compose up -d` → `check-health.sh` 200; login→patient create→logout
   ishlaydi; `/api` 80/443 orqali, 8000/3000/5432 tashqaridan yopiq.
3. **Migratsiya** real Postgres'da (`RUN_MIGRATIONS=true` entrypoint yoki qo'lda).
   Mezon: `showmigrations` hammasi `[X]`; eski SQLite ma'lumoti bo'lsa Postgres'ga
   ko'chirish rejasi (data dump/load).
4. **Seed** (`seed_platform`) real klinika/rollar bilan; demo (id=1) saqlanadi.
5. **TLS**: Caddy avtomatik Let's Encrypt (`DOMAIN`+`ACME_EMAIL`). Mezon:
   `https://dentos.cc` yashil, HSTS header bor.
6. **Backup kengaytirish** (5-bo'lim): media + telegram_media + runtime volume
   arxivi. Mezon: toza muhitda baza+media+sessiyadan to'liq tiklanadi.
7. **Telegram akkaunt ulash** real klinikada (QR yoki telefon). Jonli test faqat
   tasdiqlangan qabul qiluvchi bilan.
8. **B2** (agar yoqilsa, faqat qonuniy moslik tasdiqlangach): bucket/kalit
   nomuvofiqligini hal qilish; `MEDIA_STORAGE=b2` + `B2_MEDICAL_STORAGE_APPROVED=true`;
   sun'iy fayl bilan upload→download→huquq tekshiruvi; keyin ehtiyotkorlik bilan real.
9. **Next 16 / npm audit** — alohida sinovli ko'chirish (ixtiyoriy).

---

## 8. O'zgargan fayllar ro'yxati (bu agent)

```
frontend/src/lib/api.ts                              (API_BASE → /api)
frontend/src/lib/auth.tsx                            (logout async + await)
frontend/src/components/TelegramLoginForm.tsx        (API → /api)
frontend/src/components/KeynoteDentalPhotoProtocol.tsx (3× media-sample URL → /api)
frontend/src/app/settings/page.tsx                   (webhook URL origin-based)
backend/clinic/dev.ps1                               (DEBUG=True lokal uchun)
backend/clinic/tests/test_security.py                (YANGI — 20 test)
DEPLOYMENT_HANDOFF_UZ.md                             (YANGI — shu hujjat)
```

Yakuniy holat: **backend 80/80 test o'tadi, frontend production build + TypeScript
toza.** Docker/jonli-Telegram/real-B2/real-migratsiya — bu muhitda qasddan
bajarilmadi (yuqorida sabablari bilan).


## 2026-10-28: lokal login va foto muharrir
8000 portdagi jarayon core.verify_settings / verify.sqlite3 bilan ishlayotgan edi. Faqat shu aniqlangan test jarayoni to'xtatilib, core.settings / db.sqlite3 bilan ishga tushirildi. Demo login va /auth/me, patients, patient-media 8000 hamda 3000 orqali 200 qaytardi. Parollar o'zgartirilmadi. start-local band backend portini rad etadi va core.settings ni aniq tanlaydi.
Media download URL relative /api bo'ldi. Foto muharrir system font, dark/light, contextual panel, single-click front, double-click dimensions, original image pixel preview oldi. Brauzerda demo login, foto ochish, rasm format paneli va dark ko'rinishi tekshirildi. TypeScript o'tdi; frontend 11 test o'tdi. Production build EPERM (.next/server/app/photo-protocol mkdir) sabab tugamadi: build muvaffaqiyatli deb hisoblanmasin. Superadminning haqiqiy paroli bilan kirish tekshirilmagan.
