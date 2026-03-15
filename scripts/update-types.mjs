import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

try {
  // 1. Читаємо .env.local
  const envFile = readFileSync('.env.local', 'utf8');
  
  // 2. Витягуємо URL через регулярку
  const match = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([^.]+)/);
  
  if (!match || !match[1]) {
    throw new Error("Не вдалося знайти NEXT_PUBLIC_SUPABASE_URL або ID у .env.local");
  }

  const projectId = match[1];
  console.log(`🚀 Знайдено Project ID: ${projectId}. Генеруємо типи...`);

  // 3. Запускаємо команду Supabase CLI
  // Використовуємо npx, щоб не залежати від глобального встановлення
  execSync(`npx supabase gen types typescript --project-id ${projectId} > src/types/supabase.ts`, {
    stdio: 'inherit'
  });

  console.log("✅ Типи успішно оновлено у src/types/supabase.ts");
} catch (error) {
  console.error("❌ Помилка:", error.message);
  process.exit(1);
}