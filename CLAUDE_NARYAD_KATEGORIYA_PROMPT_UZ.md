# Claude uchun topshiriq — Naryad bo'limini 32desk «Услуги и процедуры» dizayniga keltirish

Loyiha: `C:/Users/user/Desktop/32desk` (production nomi: **dentos**, github `MuhammadOdilhonov/dentos`, deploy Docker). Avval `AGENTS.md` va `CLAUDE_NARYAD_PROMPT_UZ.md`ni o'qi (narx/foiz/jurnal ishi allaqachon bajarilgan — uni buzma). Joriy diffni tekshir. Bu fayl — **ikkinchi qism**: naryad (xizmatlar) bo'limining KO'RINISHI va TUZILMASI. Narx/foiz mantig'i tayyor, bu fayl faqat kategoriya + protsedura modali + 3 tilni qamraydi.

> ⚠️ Jonli bazaga, `.env`, Telegram sessiyalariga tegma. Migratsiya yozilsa — eski `category` matn qiymatlari YO'QOLMASIN (backfill qil). Testlar in-memory bazada.

---

## 1. Hozirgi holat (dentos, nega noto'g'ri)

Fayl: `frontend/src/app/naryads/page.tsx`
- Chapdagi `<aside>` — bu **haqiqiy kategoriya emas**, shunchaki katalogdagi `item.category` matnlaridan `Set` orqali yig'ilgan filtr tugmalari. Qo'shib/tahrirlab/o'chirib bo'lmaydi.
- O'ngda jadval: Код(id), Имя, Категория, Цена, shifokorlar, amallar.
- «Qo'shish/Tahrirlash» modali — **bitta forma**, tablarsiz: name, category (hardcoded `<option>` ro'yxatidan), base_price, description. Код, davomiylik, bufer, fiks-toggle, kalendar, Пакет/Диагноз/Манипуляции/Напоминание — **yo'q**.

Backend: `backend/clinic/models.py` → `ServiceCatalogItem` (clinic, name, `category` = oddiy `CharField`, base_price, default_percent[eski], description). Kategoriya alohida jadval emas.

**Natija:** 32deskdagidek emas. Foydalanuvchi talabi: chapda naryad **ulanadigan kategoriya yaratiladi/tahrirlanadi**, o'ngda naryad nomlari; «Qo'shish» bosilganda 32deskdagi 5 tabli modal chiqsin.

---

## 2. 32desk namuna (2026-11-05, `app.32desk.com/company/services`da jonli ko'rildi)

Sarlavha: **«Услуги и процедуры»**. O'ng yuqorida: `Действия ▾` + ko'k **«Новая процедура»**.

### Chap panel — «Услуга» (= bizdagi KATEGORIYA / guruh)
- Ustida qidiruv + **`+`** tugma (yangi «Услуга» yaratadi).
- Ro'yxat: har bir guruh nomi + yozuvlar soni (badge) + `В календаре` yorlig'i (ixtiyoriy) + tahrirlash qalami.
- `+` bosilganda modal **«Услуга»**: `Название услуги*`, `Описание`, `Отображать в календаре` (toggle, izoh: "Услуга будет отображена у сотрудников, которые её проводят"). Tugmalar: `Отмена` / `Сохранить`.

### O'ng panel — «Процедура» (= bizdagi NARYAD)
- Qidiruv + jadval ustunlari: **КОД | ИМЯ** (ostida kichik kulrang — tegishli Услуга nomi, mas. «Ортопедия») **| ЦЕНА | ДЛИТЕЛЬНОСТЬ |** tahrirlash qalami. Ba'zi qatorlarda chapda ✓ (tanlangan).

### «Новая процедура» modali — 5 TAB
Tablar: **Основные · Пакет · Диагноз · Манипуляции · Напоминание**. Pastda har doim `Отмена` / `Сохранить`.

**Основные:**
| Maydon | Izoh |
|---|---|
| `Код*` | mas. «A001» |
| `Название процедуры*` | mas. «Первичная консультация специалиста» |
| `Услуга*` | dropdown — qaysi kategoriyaga tegishli |
| `Цена` | «0 Сум» |
| `Длительность (мин)` | |
| `Буферное время` | "Время для подготовки к следующей процедуре" |
| `Фиксированная цена` | toggle (default ON) |
| `Фиксированная длительность` | toggle (default ON) |
| `Описание` | textarea |
| `Отображать в календаре` | toggle; izoh: "Процедура будет отображена у сотрудников, которые её проводят" |

**Пакет:** o'ng yuqorida jami «0 Сум», `+ Дополнительные пункты` — protsedurani boshqa protseduralardan iborat paket qilish (tarkib + yig'indi narx).

**Диагноз:** `⚡ Выбрать диагноз` — protseduraga diagnoz(lar) biriktirish.

**Манипуляции:** `+ Добавить манипуляцию` — bosqich/manipulyatsiyalar ro'yxati.

**Напоминание:** `Напомнить о процедуре` toggle (yoqilsa — necha kundan keyin eslatish sozlamalari).

---

## 3. Maqsadli dizayn (dentos uchun)

Xuddi shu ikki panelli maket; bizning mavjud slate/ko'k brend uslubida (hozirgi `page.tsx` dizayn tili saqlansin, faqat tuzilma 32deskga keltirilsin).

### A) Chap panel = **Kategoriya (Xizmat guruhi) CRUD**
- Yuqorida qidiruv + `+` (yangi kategoriya).
- Ro'yxat: nom + naryadlar soni + tahrirlash qalami + o'chirish.
- «all / Barcha xizmatlar» virtual element birinchi (filtr uchun), lekin u CRUD emas.
- Modal (kichik): `Nom*`, `Tavsif`, `Kalendarda ko'rsatish` toggle. 3 tilda.
- O'chirishda: ichida naryad bo'lsa ogohlantir (yo bloklash yoki «Umumiy»ga ko'chirish — pastdagi savolga qara).

### B) O'ng panel = **Naryad (protsedura) jadvali**
- Ustunlar: **Kod | Nom** (ostida kategoriya nomi) **| Narx | Davomiylik** + tahrirlash qalami + o'chirish.
- Kategoriya tanlanganda shu kategoriya naryadlari filtrlanadi.
- Mavjud «quick price edit» (narxni joyida tahrirlash) saqlanadi.

### C) Naryad modali = **5 tab** (Asosiy · Paket · Diagnoz · Manipulyatsiya · Eslatma)
- **Asosiy:** Kod, Nom, Kategoriya(dropdown), Narx, Davomiylik(min), Bufer vaqti, Narx fiks (toggle), Davomiylik fiks (toggle), Tavsif, Kalendarda ko'rsatish (toggle). Hamma label 3 tilda.
- **Paket / Diagnoz / Manipulyatsiya / Eslatma:** 32deskdagi UIni takrorla. Integratsiya darajasi pastdagi savolga bog'liq (MVP: ma'lumotni saqlash, ammo mavjud appointment/checkout oqimini buzmaslik).

### D) 3 TIL (uz/ru/en)
- Barcha yangi matnlar `frontend/src/lib/i18n` ichiga `naryadcat.*` kaliti sifatida 3 tilda qo'shilsin (hozirgi uslub: `tr('naryadcat.title')`). Hech bir satr hardcoded bir tilda qolmasin.
- Kategoriya NOMI — foydalanuvchi kiritadigan ma'lumot, tarjima qilinmaydi (klinika o'zi yozadi). Faqat UI yorliqlari tarjima qilinadi.

---

## 4. Backend o'zgarishlar (taxminiy — tasdiqlashga qarab)

1. **`ServiceCategory`** yangi model: `clinic(FK)`, `name`, `description(blank)`, `show_in_calendar(bool)`, `created_at`. Klinika bo'yicha nom unikal.
2. **`ServiceCatalogItem`** kengaytirish: `code(CharField, blank)`, `category_fk(FK→ServiceCategory, null)` [eski `category` matnni backfill uchun saqla], `duration_min(int,null)`, `buffer_min(int,null)`, `price_fixed(bool, default True)`, `duration_fixed(bool, default True)`, `show_in_calendar(bool, default False)`, hamda paket/diagnoz/manipulyatsiya/eslatma uchun maydonlar (MVPda JSON yoki alohida jadval — savolga qara).
3. **Migratsiya + backfill:** har klinikaning mavjud `category` matnlari uchun `ServiceCategory` yozuvlarini yaratib, `category_fk`ni to'ldir. Eski `category` ustunini O'CHIRMA (eski klient/hisobot mosligi).
4. **Serializer + ViewSet:** kategoriya CRUD endpointlari, klinika bo'yicha tenant-scoping (`clinic`), demo clinic (id=1) alohida. `frontend/src/lib/api.ts`ga `getServiceCategories/createServiceCategory/update/delete` qo'sh.
5. Mavjud `getNaryadCatalog`/`createNaryadCatalogItem` javoblariga yangi maydonlarni qo'sh (orqaga mos: eski maydonlar qolsin).

---

## 5. Frontend o'zgarishlar
- `frontend/src/app/naryads/page.tsx` — chap panelni CRUDga aylantir, modalga tab tizimi qo'sh (yoki modalni `components/NaryadModal`ga chiqar). Hozirgi KPI kartalar, quick-price, toast saqlanadi.
- Yangi `components/ServiceCategoryModal.tsx` (kategoriya qo'shish/tahrirlash).
- `lib/types.ts` — `ServiceCategory` + `NaryadCatalogItem`ning yangi maydonlari.
- `lib/i18n` — `naryadcat.*` 3 tilda to'ldir.

---

## 6. Moslik / xavfsizlik
- Narx/foiz/jurnal mantig'i (`CLAUDE_NARYAD_PROMPT_UZ.md`) o'zgarmaydi. Yangi `duration/buffer/fixed/kalendar` faqat katalog metama'lumoti; shifokor ulushi hamon xodim profilidagi foizdan.
- Yozilgan eski naryadlar (patient-records) qayta hisoblanmaydi.
- Kategoriya/naryad CRUD faqat o'z klinikasida; serverda tenant tekshiruvi.
- Appointment/checkout/calendar oqimiga yangi majburiy maydon qo'shib, eskisini sindirma. `show_in_calendar` faqat ixtiyoriy ko'rsatish.

---

## 7. Qabul mezonlari
- Chapda kategoriya qo'shish/tahrirlash/o'chirish ishlaydi; o'chirilgan kategoriya naryadlari yo'qolmaydi (savolga qarab «Umumiy»ga ko'chadi yoki o'chirish bloklanadi).
- «Qo'shish» 5 tabli modal ochadi; Asosiy tab barcha maydonlarni saqlaydi; qolgan tablar kamida UIda bor va ma'lumotni yo'qotmaydi.
- 3 tilda to'liq (uz/ru/en) — til almashganda hamma yorliq to'g'ri.
- Eski katalog ma'lumoti migratsiyadan keyin yo'qolmaydi.
- `backend`: `../.venv/Scripts/python.exe manage.py test clinic.tests --settings=core.test_settings --noinput` o'tadi.
- `frontend`: `tsc --noEmit`, `npm run build` toza.
- Brauzerda katta/kichik ekran, kategoriya filtri, modal tablari tekshiriladi.

Yakuniy hisobotda aniq o'zgargan fayllar, bajarilgan testlar va o'tkazilmagan tekshiruvlarni yoz.
