import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const linkedRefPath = 'supabase/.temp/project-ref';

function getProjectRefFromEnvFile() {
  if (!existsSync('.env.local')) return null;

  const envFile = readFileSync('.env.local', 'utf8');
  const match = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] || null;
}

try {
  const linkedRef = existsSync(linkedRefPath)
    ? readFileSync(linkedRefPath, 'utf8').trim()
    : null;

  const projectRef =
    process.env.SUPABASE_PROJECT_REF ||
    linkedRef ||
    getProjectRefFromEnvFile();

  if (!linkedRef) {
    if (!projectRef) {
      throw new Error(
        'No Supabase project ref found. Set SUPABASE_PROJECT_REF or add NEXT_PUBLIC_SUPABASE_URL to .env.local, or run `npx supabase link --project-ref <ref>` once.'
      );
    }

    console.log(`Linking Supabase project: ${projectRef}`);
    execSync(`npx supabase link --project-ref ${projectRef}`, { stdio: 'inherit' });
  }

  console.log('Pushing Supabase migrations...');
  execSync('npx supabase db push', { stdio: 'inherit' });
  console.log('✅ Migrations pushed successfully.');
} catch (error) {
  console.error('❌ Migration push failed:', error?.message || error);
  process.exit(1);
}
