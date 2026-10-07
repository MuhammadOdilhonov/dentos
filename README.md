# 🦷 32Desk Dental Clinic CRM Clone

[gemini-code-1788594745305.md](file:///c:/Users/user/Desktop/32desk/gemini-code-1788594745305.md) texnik topshirig'i (PRD) asosida to'liq yaratilgan zamonaviy stomatologiya klinikasi boshqaruv tizimi.

---

## 🛠 Texnologik Stek

- **Backend:** Python, Django 5, Django REST Framework (DRF), SQLite (PostgreSQL ga moslashgan), CORS Headers.
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons.

---

## 📱 Dastur Bo'limlari va Imkoniyatlari

### 1. Global Interfeys va Navigatsiya
- **Sidebar (Chap menyu):**
  1. **Записи (Qabullar):** Shifokorlar va kreslolar bo'yicha interaktiv taqvim (`/`).
  2. **Доска (Dashboard):** Kunlik ko'rsatkichlar, daromad va shifokorlar yuklamasi (`/board`).
  3. **Пациенты (Bemorlar):** Bemorlar to'liq bazasi, tibbiy kartalar va qabullar tarixi (`/patients`).
  4. **Склад (Ombor):** Materiallar, dori-darmonlar va qoldiq monitoringi (`/warehouse`).
  5. **Отчеты (Hisobotlar):** Kassa, kirim-chiqim va shifokorlar 35% ulushi hisob-kitobi (`/reports`).
  6. **Задачи (Vazifalar):** Xodimlar uchun topshiriqlar (`1192` badge ko'rsatkichi bilan) (`/tasks`).
  7. **Лаборатория (Laboratoriya):** Tish texniklari bilan ishlash, buyurtmalar nazorati (`/lab`).
  8. **Пульс (beta):** Real vaqtda kreslolar bandligi va kutish zali monitoringi (`/pulse`).
  9. **Помощь (Yordam):** Qoidalar, tezkor tugmalar va FAQ (`/help`).

- **Header (Yuqori panel):**
  - **Global Qidiruv:** Bemor ismi, telefoni yoki ID raqami bo'yicha tezkor live qidiruv.
  - **Сегодня:** Bugungi kunga bir zumda qaytish tugmasi.
  - **+ Новый пациент:** Bemor yaratish tezkor oynasi (modal).
  - **Язык / Til:** RU / UZ rejimlarini almashtirish.
  - **Уведомления:** SMS statuslari va shoshilinch vazifalar bildirishnomasi.
  - **Профиль (MO):** Bosh shifokor / Admin akkaunti.

### 2. "Записи" (Qabullar Taqvimi)
- **Vaqt oralig'i:** 09:00 dan 22:30 gacha (har 30 daqiqalik qadam bilan).
- **Ustunlar:** Shifokorlar (Сардор, Сервер, Озод, Мальвина) yoki Kreslolar (1-4) bo'yicha guruhlash.
- **Kartochkalar rangi:**
  - 🟢 **Yashil** — Keldi / Tasdiqlangan (`confirmed`).
  - 🟣 **Siyohrang** — Jarayonda / Kresloda davolanmoqda (`in_progress`).
  - 🔵 **Ko'k** — Band qilingan (`reserved`).
  - 🟠 **Apelsin** — Qarzi bor (`debt`).
  - ⚪ **Kulrang** — Yakunlangan (`completed`).
  - 🔴 **Qizil** — Bekor qilingan (`cancelled`).
- **Ikonkalar:** SMS yuborilganligi qushchasi, To'lov/qarz holati ($), Tish muolajasi belgisi.
- **Interaktivlik:**
  - Kartani bosganda: Bemor kartasini ko'rish, statusni o'zgartirish, SMS yuborish, kassa to'lovini qabul qilish.
  - Bo'sh katakchani bosganda: O'sha vaqt va shifokorga yangi qabul yozish oynasi ochiladi.

---

## 🚀 Ishga Tushirish (Tezkor va oson)

### 1-usul: `start.bat` orqali (Bitta bosishda)
Loyihaning ildiz papkasidagi `start.bat` faylini ikki marta bosing. U avtomatik tarzda:
1. Django migratsiyalarini o'tkazadi va demonstratsion ma'lumotlarni (`seed_data`) yuklaydi.
2. Backend API ni `http://127.0.0.1:8000` da ishga tushiradi.
3. Next.js Frontend ni `http://localhost:3000` da ishga tushiradi va brauzerda ochadi.

### 2-usul: Qo'lda (Terminal orqali)

**Backend:**
```bash
cd backend
python manage.py migrate
python manage.py seed_data
python manage.py runserver 127.0.0.1:8000
```

**Frontend:**
```bash
cd frontend
npm run dev
```

Brauzerda [http://localhost:3000](http://localhost:3000) manziliga kiring.
