import * as fs from 'fs';
import * as path from 'path';

function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `./backups/backup-${timestamp}`;
  
  if (!fs.existsSync('./backups')) {
    fs.mkdirSync('./backups', { recursive: true });
  }
  fs.mkdirSync(backupDir, { recursive: true });
  
  // Backup CSV
  if (fs.existsSync('logs/trades.csv')) {
    fs.copyFileSync('logs/trades.csv', path.join(backupDir, 'trades.csv'));
    console.log(`✅ Backup creado: ${backupDir}/trades.csv`);
  }
  
  // Backup DB if exists
  if (fs.existsSync('data/trades.db')) {
    fs.copyFileSync('data/trades.db', path.join(backupDir, 'trades.db'));
    console.log(`✅ Backup creado: ${backupDir}/trades.db`);
  }
  
  // Backup .env
  if (fs.existsSync('.env')) {
    fs.copyFileSync('.env', path.join(backupDir, 'env-backup'));
    console.log(`✅ Backup creado: ${backupDir}/env-backup`);
  }
  
  console.log(`\n🛡️  Backup completo en carpeta: ${backupDir}`);
  console.log('Si algo falla, puedes restaurar copiando los archivos de vuelta.');
}

createBackup();
