import { db } from '../src/lib/db';
import { analyzeCadCaseWithAi } from '../src/lib/cad-ai-service';

async function testAiVlmIntegration() {
  console.log('--- Testing AI VLM Integration & Case Status ---');
  const latestCase = (await db.prepare('SELECT id, case_no, case_name, status, company_id, designer_name, project_name, quote_memo FROM quotation_cases ORDER BY created_at DESC LIMIT 1').get()) as any;
  console.log('Target Case:', latestCase);

  if (latestCase) {
    console.log('Invoking analyzeCadCaseWithAi for case:', latestCase.id);
    const aiResult = await analyzeCadCaseWithAi(latestCase.id);
    console.log('AI Result Title Block Analysis:');
    console.log(JSON.stringify(aiResult.titleBlockAnalysis, null, 2));
    console.log('AI Detected Critical Manufacturing Notes:');
    console.log(aiResult.drawingAndMachiningFeatures?.criticalManufacturingNotes);
    console.log('Company Confidence:', aiResult.titleBlockAnalysis?.companyConfidence, '%');
  }
}

testAiVlmIntegration().catch(console.error);
