# NEWMAN

מערכת פנימית בעברית לניהול עובדים, פרויקטים ודיווחי שעות, בנויה עם Next.js, TypeScript, Tailwind CSS ו-Supabase.

## התקנה

1. צרו פרויקט Supabase חדש.
2. הריצו ב-Supabase SQL Editor את `supabase/migrations/20260930000000_initial_schema.sql`.
3. ב-Authentication → Users צרו משתמש מורשה ידנית. אין הרשמה עצמית.
4. העתיקו `.env.example` אל `.env.local` והזינו את כתובת הפרויקט ואת ה-anon/publishable key. אין להשתמש ב-service role בדפדפן.
5. הריצו `npm install` ואחריו `npm run dev`.

פתחו `http://localhost:3000`. משתמש לא מחובר יופנה ל-`/login`.

## בדיקות ייצור

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

## מבנה

- `src/app/(app)` — אזור מאומת ודפי המערכת
- `src/components` — רכיבי UI וטפסים לשימוש חוזר
- `src/lib/supabase` — לקוחות Supabase לשרת ולדפדפן
- `src/lib` — טיפוסים וכלי עזר עסקיים
- `supabase/migrations` — סכמת PostgreSQL, אינדקסים, אילוצים ו-RLS

## המשך מומלץ: Telegram

האינטגרציה הראשונית נמצאת ב-`/api/telegram/webhook` ותומכת ב-`/start`, `/projects`, `/employees`, `/today`, `/help` ובפקודת הזיהוי `/myid`.

יש להוסיף לסביבת השרת בלבד את `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_IDS` ו-`SUPABASE_SERVICE_ROLE_KEY`. לאחר deployment לכתובת HTTPS ציבורית, טענו את משתני הסביבה בטרמינל והריצו:

```bash
npm run telegram:register -- https://your-production-domain.example
```

הסקריפט קורא את הסודות ממשתני הסביבה ואינו מדפיס אותם. להרשאה ראשונית, שלחו לבוט `/myid`, העתיקו את המספר שהתקבל אל `TELEGRAM_ALLOWED_CHAT_IDS` (מספר מזהים מופרדים בפסיקים), ועדכנו את ה-deployment.
