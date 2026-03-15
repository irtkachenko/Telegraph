# Trace

Р’РµР±-РґРѕРґР°С‚РѕРє РЅР° Р±Р°Р·С– Next.js 15 С‚Р° React 19. РЁР°Р±Р»РѕРЅ РґР»СЏ СЃС‚РІРѕСЂРµРЅРЅСЏ РІРµР±-РїСЂРѕРµРєС‚С–РІ Р· С„СѓРЅРєС†С–РѕРЅР°Р»РѕРј Р°РІС‚РѕСЂРёР·Р°С†С–С— С‚Р° СЂРѕР±РѕС‚Рё Р· РґР°РЅРёРјРё.

## РћРїРёСЃ РїСЂРѕРµРєС‚Сѓ

РЁР°Р±Р»РѕРЅ РІРµР±-РґРѕРґР°С‚РєСѓ, СЏРєРёР№ РІРєР»СЋС‡Р°С”:
- РђРІС‚РѕСЂРёР·Р°С†С–СЋ С‡РµСЂРµР· Google
- Р†РЅС‚РµСЂС„РµР№СЃ РґР»СЏ СЂРѕР±РѕС‚Рё Р· РґР°РЅРёРјРё
- РџС–РґРєР»СЋС‡РµРЅРЅСЏ РґРѕ Р±Р°Р·Рё РґР°РЅРёС… Supabase

## РўРµС…РЅРѕР»РѕРіС–С—

- **Frontend:** Next.js 15, React 19, TypeScript
- **Р‘Р°Р·Р° РґР°РЅРёС…:** Supabase (PostgreSQL)
- **РЎС‚РёР»С–:** Tailwind CSS
- **РџР°РєРµС‚РЅРёР№ РјРµРЅРµРґР¶РµСЂ:** PNPM

## РЇРє Р·Р°РїСѓСЃС‚РёС‚Рё

### Р’Р°СЂС–Р°РЅС‚ 1: Р‘РµР· Docker (РїСЂРѕСЃС‚С–С€РёР№)

1. Р’СЃС‚Р°РЅРѕРІС–С‚СЊ Р·Р°Р»РµР¶РЅРѕСЃС‚С–:
```bash
pnpm install
```

2. РЎС‚РІРѕСЂС–С‚СЊ С„Р°Р№Р» `.env.local` Р· РЅР°Р»Р°С€С‚СѓРІР°РЅРЅСЏРјРё (РґРёРІ. РЅРёР¶С‡Рµ)

3. Р—Р°РїСѓСЃС‚С–С‚СЊ РїСЂРѕРµРєС‚:
```bash
pnpm dev
```

### Р’Р°СЂС–Р°РЅС‚ 2: Р— Docker

1. Р—Р°РїСѓСЃС‚С–С‚СЊ РєРѕРЅС‚РµР№РЅРµСЂ:
```bash
docker-compose up -d --build
```

2. Р’СЃС‚Р°РЅРѕРІС–С‚СЊ Р·Р°Р»РµР¶РЅРѕСЃС‚С– РІ РєРѕРЅС‚РµР№РЅРµСЂС–:
```bash
docker exec -it trace-app pnpm install
```

3. Р—СѓРїРёРЅС–С‚СЊ РїСЂРѕРµРєС‚:
```bash
docker-compose down
```

## РљРѕСЂРёСЃРЅС– РєРѕРјР°РЅРґРё

| РљРѕРјР°РЅРґР° | РћРїРёСЃ |
| :--- | :--- |
| `pnpm dev` | Р—Р°РїСѓСЃРє СЃРµСЂРІРµСЂР° СЂРѕР·СЂРѕР±РєРё |
| `pnpm build` | Р—Р±С–СЂРєР° РїСЂРѕРµРєС‚Сѓ |
| `pnpm format` | Р¤РѕСЂРјР°С‚СѓРІР°РЅРЅСЏ РєРѕРґСѓ |
| `pnpm lint` | РџРµСЂРµРІС–СЂРєР° РєРѕРґСѓ РЅР° РїРѕРјРёР»РєРё |

## РќР°Р»Р°С€С‚СѓРІР°РЅРЅСЏ

РЎС‚РІРѕСЂС–С‚СЊ С„Р°Р№Р» `.env.local` Сѓ РєРѕСЂРµРЅС– РїСЂРѕРµРєС‚Сѓ Р· С‚Р°РєРёРјРё Р·РјС–РЅРЅРёРјРё:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key

# Google OAuth (СЏРєС‰Рѕ РїРѕС‚СЂС–Р±РЅР° Р°РІС‚РѕСЂРёР·Р°С†С–СЏ С‡РµСЂРµР· Google)
AUTH_GOOGLE_ID=your_google_client_id
AUTH_GOOGLE_SECRET=your_google_client_secret
AUTH_SECRET=your_auth_secret
NEXTAUTH_URL=http://localhost:3000
```

### РЇРє РЅР°Р»Р°С€С‚СѓРІР°С‚Рё Google OAuth

1. РџРµСЂРµР№РґС–С‚СЊ РІ [Google Cloud Console](https://console.cloud.google.com/)
2. РЎС‚РІРѕСЂС–С‚СЊ РЅРѕРІРёР№ РїСЂРѕРµРєС‚
3. РќР°Р»Р°С€С‚СѓР№С‚Рµ OAuth consent screen (External С‚РёРї)
4. РЎС‚РІРѕСЂС–С‚СЊ OAuth client ID РґР»СЏ Web application
5. Р”РѕРґР°Р№С‚Рµ redirect URI: `http://localhost:3000/api/auth/callback/google`


## РњС–РіСЂР°С†С–С— Supabase

### РЇРє Р·Р°РїСѓСЃС‚РёС‚Рё push-РјС–РіСЂР°С†С–С—

1. РџРµСЂРµРєРѕРЅР°Р№С‚РµСЃСЏ, С‰Рѕ РІР°С€ Supabase-РїСЂРѕС”РєС‚ Р·Р°Р»С–РЅРєРѕРІР°РЅРёР№ (Р°Р±Рѕ РІРєР°Р¶С–СЊ project ref).
2. Р—Р°РїСѓСЃС‚С–С‚СЊ РєРѕРјР°РЅРґСѓ:
```bash
pnpm push-migrations
```

### РќР° Р·Р°РјС–С‚РєСѓ

РЎРєСЂРёРїС‚ `push-migrations` СЃРїСЂРѕР±СѓС” Р·РЅР°Р№С‚Рё project ref у:
1. `SUPABASE_PROJECT_REF` (env)
2. `supabase/.temp/project-ref` (РїС–СЃР»СЏ `supabase link`)
3. `.env.local` (поля `NEXT_PUBLIC_SUPABASE_URL`)

### SUPABASE_SERVICE_ROLE_KEY (server-only)

Для коректного читання конфігу Storage bucket на сервері додайте змінну:

```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

Важливо: цей ключ **не можна** використовувати на клієнті й **не можна** робити `NEXT_PUBLIC_`.
