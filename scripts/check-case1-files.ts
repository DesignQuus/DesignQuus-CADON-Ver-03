import { db } from '../src/lib/db';

async function main() {
  const caseId = 'case_1789766302590';
  const files = await db.prepare(`SELECT * FROM uploaded_files WHERE quotation_case_id = ?`).all(caseId) as any[];
  console.log('Files for case 1:', files.map(f => ({ id: f.id, name: f.original_file_name, type: f.file_type, role: f.file_role, path: f.storage_path })));
}

main().catch(console.error);
