import { generateCadSemanticChunks, saveCadSemanticChunks, searchCadRagChunks } from '../src/lib/cad-chunking-engine';

async function run() {
  console.log('--- 1. Testing Chunk Generation for case_1790800374573 ---');
  const caseId = 'case_1790800374573';
  const chunks = await generateCadSemanticChunks(caseId);
  console.log(`Generated ${chunks.length} chunks!`);
  for (const c of chunks) {
    console.log(`[${c.chunkType}] ${c.chunkTitle} (Parent: ${c.parentChunkId || 'None'}) - Len: ${c.chunkContent.length}`);
  }

  console.log('\n--- 2. Testing Chunk Persistence to EGDesk cad_rag_chunks ---');
  const saveRes = await saveCadSemanticChunks(chunks);
  console.log(`Saved chunks count: ${saveRes.savedCount}`);

  console.log('\n--- 3. Testing Hybrid Semantic Retrieval ---');
  const queries = [
    '샤프트',
    'S45C 크롬도금',
    '13 SET',
    'Ø28 f6',
    'END CAP'
  ];

  for (const q of queries) {
    const results = await searchCadRagChunks(q, { caseId, limit: 2 });
    console.log(`\nQuery: "${q}" -> Found ${results.length} matches:`);
    for (const r of results) {
      console.log(`  * [Score: ${r.hybridScore} (Vec: ${r.vectorScore}, Key: ${r.keywordScore})] ${r.chunk.chunkTitle}`);
      if (r.parentChunk) {
        console.log(`    -> Parent: ${r.parentChunk.chunkTitle}`);
      }
    }
  }

  console.log('\n--- ALL TESTS FINISHED SUCCESSFULLY ---');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
