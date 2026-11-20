# Spin Arena — Website + Android

यह प्रोजेक्ट free entertainment game है। इसमें केवल virtual coins हैं। कोई deposit, paid spin, cash prize, wallet withdrawal या coin transfer नहीं है।

## 1. Supabase सेटअप
1. https://supabase.com पर अपना project खोलें।
2. SQL Editor → New query में `supabase.sql` का पूरा code paste करके Run करें।
3. Project Settings → API में Project URL और publishable/anon key कॉपी करें।
4. `app.js` में `SUPABASE_URL` और `SUPABASE_ANON_KEY` बदलें।
5. Supabase Authentication → Providers → Email enabled रखें।
6. Email confirmation चालू है तो signup के बाद inbox से confirmation करें। चाहें तो development में ही confirmation setting बदलें।

**महत्वपूर्ण:** `service_role` या secret key कभी भी `app.js`, website या Android app में न डालें।

## 2. Website चलाएँ
इस folder को VS Code में खोलें। Live Server से `index.html` चलाएँ या किसी static HTTPS hosting पर deploy करें (Netlify/Vercel/GitHub Pages)।
PWA install के लिए HTTPS जरूरी है। Service worker localhost/HTTPS पर ही काम करता है।

## 3. Android app बनाना (Windows)
1. Node.js LTS, Android Studio और Android SDK install करें।
2. इस folder में terminal खोलें:
   ```bash
   npm install
   npx cap add android
   npx cap sync android
   npx cap open android
   ```
3. Android Studio में Gradle sync पूरा होने दें।
4. Build → Build Bundle(s) / APK(s) → Build APK(s) चुनें।
5. APK test करने के बाद Play Store publish से पहले app signing, privacy policy, data safety और current Play policies पूरी करें।

Android project पहली बार `npx cap add android` से बनेगा; इसलिए generated `android/` folder इस ZIP में नहीं है।

## 4. Game rules और security
- एक authenticated account को 24 घंटे में एक free spin।
- reward browser नहीं चुनता। `spin_once()` database function reward चुनकर balance और history एक transaction में update करता है।
- wallet/history tables पर user केवल अपना data read कर सकता है; client writes बंद हैं।
- यह starter project है, production launch से पहले abuse testing, rate limiting, monitoring, privacy policy और legal review करें।
- Virtual coins का कोई monetary value नहीं है और उन्हें बेचने/खरीदने/withdraw करने की सुविधा नहीं है।
