# كربلاء ميديا – تطبيق أندرويد

- Package: `app.karbala.media`
- نسخة واحدة (Universal APK) تعمل على كل الأجهزة (Android 5.0 فما فوق، كل المعالجات).
- التطبيق = WebView يحمّل `index.html` المحلي عبر `https://appassets.androidplatform.net` (ضروري ليعمل يوتيوب).

## البناء
**GitHub Actions:** ارفع المشروع → تبويب Actions → Build Android APK → Run workflow → حمّل الملف من Artifacts.

**Android Studio:** افتح مجلد `android` ثم Build ▸ Build APK(s).

## تحديث الموقع
غيّر `index.html` في الجذر ثم أعد البناء (الـ workflow ينسخه تلقائياً، ولو بنيت يدوياً انسخه إلى `android/app/src/main/assets/index.html`).

## التوقيع (للنشر على Google Play أو لتحديث التطبيق لاحقاً بنفس المفتاح)
أضف Secrets في GitHub: `KEYSTORE_BASE64` و`KEYSTORE_PASSWORD` و`KEY_ALIAS` و`KEY_PASSWORD`.
بدونها يُوقَّع بمفتاح debug (يصلح للتثبيت المباشر).
