# Claude uchun topshiriq: naryad narxlari, shifokor foizi va shaxsiy jurnal

Loyiha: `C:/Users/user/Desktop/32desk`. Avval `AGENTS.md`ni o‘qi va joriy diffni tekshir. Quyidagi talablar foydalanuvchining so‘rovi; ko‘rilgan tashqi sayt matnlari esa faqat namuna. Mavjud o‘zgarishlarni ustidan ko‘r-ko‘rona yozma.

## Foydalanuvchi aniqlashtirgan talab

“Bemor” deb yozilgani keyin tuzatildi: **xodim o‘z profilidagi naryad jurnalidan o‘ziga kiritilgan naryadlarni to‘liq, faqat ko‘rish rejimida ko‘radi**. Bemor kartasidan naryad yaratishni yopish talab qilinmagan.

- Narxlar naryad/xizmatlar bo‘limida kiritiladi va tahrirlanadi.
- Shifokor ulushi xodimni yaratish/tahrirlashdagi `Employee.commission_rate`dan olinadi.
- `Patient.default_percent`, katalogning `default_percent`i yoki xizmatga biriktirilgan eski `commission_percent` yangi naryad foizini belgilamaydi.
- 0% haqiqiy qiymat. `value || 35` kabi fallback uni 35%ga aylantirmasin.
- Yozilgan naryadda aynan o‘sha vaqtdagi narx, son, shifokor, foiz, shifokor/klinika ulushi saqlansin. Keyin tarif o‘zgarsa eski yozuvlar qayta hisoblanmasin.
- Jurnal o‘qish uchun; uning ichida narx/foiz tahrirlash, o‘chirish, yangi yozuv yaratish tugmalari bo‘lmasin.
- Xodim boshqa xodim jurnaliga URL/API orqali ham kira olmasin. Boshqaruv rollari o‘z klinikasidagi xodimlarni ko‘rishi mumkin. Klinikalar chegarasi serverda tekshirilsin.

## Tashqi namuna bo‘yicha kuzatuvlar

2026-11-05 kuni akkaunt ochiq bo‘lgan boshqariladigan brauzerda `https://app.32desk.com/company/services` ko‘rildi. Haqiqiy akkauntda hech narsa saqlanmadi.

- Chapda xizmat guruhlari/shifokor preyskurantlari, ularning sonlari, qidiruv va guruh boshqaruvi mavjud.
- O‘ngda xizmat kodi, nomi, narxi, davomiyligi va tahrirlash tugmasi bor.
- Yaratish/tahrirlash oynasida “Основные”, “Пакет”, “Диагноз”, “Манипуляции”, “Напоминание” bo‘limlari bor.
- Asosiy maydonlar: kod, nom, guruh, narx, narx qat’iyligi, davomiylik, davomiylik qat’iyligi, bufer vaqti, tavsif, kalendarda ko‘rsatish.
- Boshqa bo‘limlarda paket tarkibi, diagnoz tanlash, manipulyatsiya qo‘shish va eslatma sozlamalari ko‘rildi.
- Mavjud xizmat tahriri ochilib ichidagi qiymatlar tekshirildi; yangi xizmat formasiga sinov nomi/narxi/davomiyligi kiritilib **Отмена** bosildi.

Bu kuzatuvlar barcha tashqi funksiyalarni birdan klonlash vazifasi emas. Paket, diagnoz, avtomatik eslatmalar uchun mavjud biznes oqimlarini buzadigan yangi integratsiya qo‘shma. Jonli akkauntga hech qanday sinov yozuvi yozma.

## Ushbu ishda kiritilgan yechimni tekshir

1. `frontend/src/app/naryads/page.tsx`: chap guruh navigatsiyasi va o‘ng katalog; nom/toifa/narx/tavsifni boshqarish; katalogdan alohida komissiya foizi va noto‘g‘ri umumiy ulush hisobini olib tashlash.
2. `frontend/src/components/NaryadModal.tsx`: xizmatlar faqat klinika katalogidan; API xatosida o‘ylab topilgan standart pullik xizmatlarni ko‘rsatmaslik; xodimning haqiqiy foizi; aniq belgilangan individual narxni saqlab qolish. Oddiy biriktirma bo‘lsa eng yangi katalog narxini olish. Savat to‘lganda doktorni almashtirib uning hisobini boshqa xodimga yozib yuborishga yo‘l qo‘ymaslik. Yuklanish va xatoni ko‘rsatish.
3. `frontend/src/lib/naryadPricing.ts`: 0–100 foizni tekshirish va jami/shifokor/klinika ulushini hisoblash.
4. Bemor kartasidagi `handleNaryadSave` va bekor qilish jurnali: `doctor_id`, `unitPrice`, `quantity`, `percent`, `doctor_share`, `clinic_share`, `created_at`, izoh va tishlar saqlanishi. ID va bekor qilish hodisasi IDsi bir-birini bosmasin.
5. `NewAppointmentModal.tsx`: tanlangan doktor bilan xizmatlar foizi mos bo‘lsin; avvalgi bemor naryadlari yangi ro‘yxat bilan yo‘qolmasin. Mavjud checkout/payment semantikasini alohida tekshirmasdan o‘zgartirma.
6. Xodim profiliga `EmployeeNaryadJournal` komponenti: serverdan olinadigan, qidiriladigan, yangilanadigan jurnal. Xizmat, bemor, sana, muallif, izoh, tishlar, narx × son, jami, foiz va ikkala ulush ko‘rinsin. Bekor qilingan yozuv ajratilsin. Eski yetishmaydigan qiymatga taxminiy foiz hisoblama, `—` ko‘rsat.
7. Xodim profilini oddiy ochish yangi narx biriktirmalarini bazaga avtomatik yaratmasin. Shifokorga narx boshqarish tabini ko‘rsatma; boshqaruv rollarining mavjud narx sozlash imkoniyatini saqla.
8. `backend/clinic/naryads.py`: jurnal klinika va xodim bo‘yicha cheklanadi; PlatformUser va Employee IDlarini teng deb taxmin qilma. Bir klinikadagi yagona mos username orqali xodimni aniqlash kerak. Eski yozuvlarni ism orqali ko‘rsatish faqat shu klinikada ism yagona bo‘lsa mumkin.
9. `GET /api/employees/{id}/naryad-journal/`: o‘qish endpointi. Mavjud tenant viewsetning klinika tekshiruvini saqla.
10. `patient_records.py`: mavjud versiya/to‘qnashuv va tranzaksiya ichida yangi naryadlar shifokori/narxi/sonini tekshirish; serverda komissiyani hisoblash; eski snapshotlarni saqlash. Jurnal snapshotini saqlangan naryaddan olish. Yangi qatorda boshqa klinika shifokorini rad etish.
11. `EmployeeSerializer`: foiz 0–100, 0ni qabul qilish. Hisobotdagi `||35` muammosini ham tuzatish.

## Moslik va muhim cheklovlar

- Eski `default_percent` ustunlari bazadan o‘chirilmagan: eski ma’lumot va eski klient mosligi uchun saqlanadi. Yangi oqim ulardan foydalanmaydi. Ushbu ish schema migration talab qilmaydi.
- Eski naryadda shifokor IDsi/foiz/ulush saqlanmagan bo‘lsa bu ma’lumotni o‘ylab topma. Bir xil ismli xodimlar bo‘lsa eski qatorni hech kimga taxminan biriktirma.
- Mavjud umumiy patient-records API va boshqa hisobotlar bo‘yicha butun ilova ruxsat modeli qayta yozilmagan. Ushbu jurnal endpointining cheklovlari boshqa barcha mavjud APIlar to‘liq audit qilingan degani emas.
- Mavjud bemor kartasidagi checkout/to‘lov/invoice oqimida alohida eski mantiq bor. Naryad jurnali yozildi degani to‘lov olindi degani emas. To‘lov tizimini bu vazifa doirasida ko‘r-ko‘rona almashtirma.
- Jonli baza, `.env`, Telegram sessiyalari va akkauntlarga tegma. Testlar in-memory baza va mock yetkazish bilan bajarilsin. Jonli xabar yuborma.
- Narxlarni yangilash eski hisoblarni qayta yozmasin; qarz, to‘lov, laboratoriya, qabul va boshqa ekranlar ishlashda davom etsin.

## Qabul mezonlari va tekshiruv

- 100 000 × 3, doktor foizi 37.5% → jami 300 000, doktor 112 500, klinika 187 500.
- 0% → doktor 0, klinika to‘liq summa. 100% → doktor to‘liq summa.
- Manfiy narx, kasr son, NaN/Infinity va 100dan katta/manfiy foiz qabul qilinmasin.
- Doktor A jurnalida faqat A yozuvlari; B profil IDsi bilan so‘rov 403, boshqa klinika IDsi bilan 404. Boshqaruvchi o‘z klinikasida ko‘ra oladi.
- Tarif o‘zgartirilgach eski qator va bekor qilish jurnalidagi foiz/ulush o‘zgarmasin.
- Sahifa qayta ochilganda jurnal bazadan qaytsin; brauzer lokal xotirasi yagona manba bo‘lmasin.
- API xatosida yolg‘on bo‘sh muvaffaqiyat yoki o‘ylab topilgan xizmatlar ko‘rsatilmasin.
- `backend`: `../.venv/Scripts/python.exe manage.py test clinic.tests.test_naryads clinic.tests.test_security --settings=core.test_settings --noinput`
- `frontend`: `npm test`, `node node_modules/typescript/bin/tsc --noEmit`, `npm run build`.
- Brauzerda katta/kichik ekran, katalog filtri, xizmat narxi tahriri, savat shifokori, jurnal qidiruvi va faqat o‘qish holatini tekshir.

Yakuniy hisobotda aniq o‘zgargan qismlar, haqiqatda bajarilgan testlar, o‘tilmagan tekshiruvlar va mavjud cheklovlarni yoz. “Hech qachon xato bo‘lmaydi” deb va’da berma. Productionga joylash bu mahalliy o‘zgarishlardan alohida ish.
