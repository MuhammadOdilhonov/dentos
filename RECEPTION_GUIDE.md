# 32Desk — klinika Telegram akkauntidagi yordamchi

Bemorlar bilan yozishish **klinikaning oddiy Telegram akkaunti** orqali amalga oshadi. Telefon yoki QR bilan ulanadi. **Telegram bot faqat CRMga login uchun** qoladi. Oldingi alohida bemor botini ishga tushirish buyrug‘i bloklandi va ulash oynasidan Bot varianti olib tashlandi.

## Ishlash tartibi

1. CRMda kerakli klinikani oching va Sozlamalar → Telegram orqali klinika akkauntini telefon/QR bilan ulang.
2. AI Administrator va avto-eslatma modullari yoqilgan bo‘lsin. Eslatma sozlamalarida Telegram yuborish ham yoqiladi. AI provayder kaliti shart emas.
3. Shifokorlar, filiallar va ish jadvalini to‘ldiring. Yordamchi faqat jadval va mavjud qabullarga qarab bo‘sh vaqt beradi.
4. Backend server ishlab turganda akkaunt xabarlari tinglanadi. Klinikaga egaligi aniq bo‘lmagan eski sessiya avtomatik boshqa klinikaga biriktirilmaydi; bunday akkauntni CRMda qayta ulang.

Bemor alohida bot ochmaydi. Klinika akkauntiga oddiy xabar yozadi. Yordamchi suhbatlashadi, telefon/ismni oladi, shifokor va vaqtni kelishadi, tasdiqdan so‘ng CRMga qabul yaratadi. «Ertaga soat 16 ga yozib qo‘ying» kabi so‘rovdagi vaqt keyingi savollar orasida saqlanadi. Ko‘chirishda qabulning o‘zi yangilanadi. Bekor qilish alohida tasdiqlanadi.

Mavjud bemor telefoni Telegramdan ko‘rinsa yoki o‘z kontakti biriktirilsa tekshiriladi. Faqat qo‘lda kiritilgan raqam boshqa bemorning qabulini ochmaydi. Yangi raqam yangi lid uchun qabul qilinadi.

## Administrator kuzatuvi

- Bemor kartasidagi mavjud Telegram chat orqali akkaunt yozishmalarini ko‘rish mumkin.
- Backendning `/admin/clinic/receptioncontact/` bo‘limida suhbat bosqichi, kiruvchi/chiquvchi xabarlar, qabulga bog‘langan bemor, til va vaqt mintaqasi ko‘rinadi.
- Bu bo‘lim Django staff ruxsatini talab qiladi. Superuser barcha klinikalarni, xodimga bog‘langan staff foydalanuvchi o‘z klinikasini ko‘radi.
- “Avtomatik suhbatni pauza qilish” va “davom ettirish” amallari bor. Oddiy yozilish uchun administratorning har bir xabarni tasdiqlashi kerak emas.
- Operator so‘ralganda CRM Vazifalar bo‘limida topshiriq paydo bo‘ladi.

## Joylashuv va vaqt

Oddiy Telegram akkauntidan bemorning joriy geografik joylashuvi yoki telefonidagi vaqt mintaqasini yashirincha olib bo‘lmaydi. Telefon kodi, yozish tili yoki onlayn holati bunga ishonchli dalil emas. [Telegram User maydonlari](https://core.telegram.org/constructor/user).

Agar bemor o‘zi “Men hozir Londondaman”, “Я сейчас в Москве”, “I'm in London” desa, qo‘llab-quvvatlangan shaharning vaqt mintaqasi saqlanadi. Hozir Toshkent, Moskva, London, Dubay, Istanbul, Nyu-York, Seul, Berlin, Tokio taniladi. IANA mintaqasini `/timezone Europe/London` shaklida ham ko‘rsatish mumkin. Safar rejasi yoki joylashuvni inkor qilish joriy joylashuv deb olinmaydi. Noma’lum shahar taxmin qilinmaydi.

- Qabulning asosiy sanasi/soati doim **Toshkent vaqti (UTC+05:00)** bilan belgilanadi.
- Bemorning mintaqasi ma’lum bo‘lsa, tasdiq va eslatmada uning mahalliy vaqti ham yoziladi.
- Kunlik/haftalik eslatma bemorning mahalliy vaqti bilan sozlangan soatda yuboriladi. 09:00–20:00 tashqarisida yuborilmaydi. Yozgi-qishki vaqt o‘zgarishlari IANA bazasi orqali hisoblanadi.
- Joylashuv ma’lumoti 30 kundan keyin eskirgan hisoblanadi.
- Mintaqa noma’lum yoki eskirgan bo‘lsa, **Toshkent vaqti bo‘yicha yuboriladi**. Bunda chet eldagi bemorning tun vaqtiga tushmasligini kafolatlab bo‘lmaydi. Joylashuv yashirincha kuzatilmaydi va uni aytish majburiy emas.
- `/stop` eslatmalarni o‘chiradi, `/start` qayta yoqadi.

## Jonli akkauntsiz sinov

`32desk/start-reception-demo.bat` faylini oching. Demo xotiradagi alohida bazada ishlaydi, haqiqiy bemorlar va Telegramga tegmaydi.

Namuna: `ertaga soat 16 ga yozib qo‘ying` → yangi telefon raqami yoki demo `/contact` → ism-familiya → shifokor `1` → `ha`. Keyin `ko‘chirish`, `qabullarim`, `kelaman` ni sinang. `/exit` chiqadi.

Javoblar tabiiyroq yozildi; yordamchi o‘zini har safar “algoritm” deb tanishtirmaydi. To‘g‘ridan-to‘g‘ri so‘ralganda virtual yordamchi ekanini to‘g‘ri aytadi. Hozircha AI modeli ulanmagan: bu cheklangan, qoidaga asoslangan suhbat; erkin mavzudagi barcha gaplarni tushunishi kafolatlanmaydi.

## Tekshiruv

60 ta backend testi o‘tdi: login, yangi lid, qabul, ko‘chirish, tasdiqlash, takroriy xabar, klinikalar izolyatsiyasi, akkaunt tanlash, eslatma, opt-out, mintaqa va yozgi-qishki vaqt. Frontend TypeScript tekshiruvi ham o‘tkazildi. Haqiqiy Telegram akkauntiga ulanib bemorga xabar yuborish sinovi o‘tkazilmadi.

Bemor botiga oid avvalgi yo‘riqnoma almashtirildi. Yangi kod `telegram_auth.py → reception_account.py → reception.py` oqimi orqali ishlaydi; eslatmalar ham `reception_account.py` orqali klinika akkauntidan yuboriladi. Eski AI simulyator API-si alohida eski modul bo‘lib qolgan; yangi akkaunt oqimini yuqoridagi demo va testlar bilan tekshiring.

Avtomatik yangi eslatma yo‘li Telegram akkauntiga mo‘ljallangan. GSM SMS shlyuzi yangi jadvalga ulanmagan. Tarmoq uzilishida Telegram xabarni qabul qilgan-qilmagani noaniq qolsa, qayta urinishda dublikat xabar ehtimoli bor; bazadagi qabul esa qayta yaratilmaydi.
