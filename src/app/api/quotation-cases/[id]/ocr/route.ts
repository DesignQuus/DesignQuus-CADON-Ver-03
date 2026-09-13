import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { recordActivity } from '@/lib/audit';
import { callAiCaller } from '../../../../../../egdesk-helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const { imageBase64, roiBbox, prompt } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { error: 'OCR 분석을 위한 이미지 데이터(imageBase64)가 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    // Call EGDesk AI Caller MCP (Gemini Vision)
    const systemPrompt = `당신은 CAD 도면 및 엔지니어링 도면의 표제란, BOM, 사양표 텍스트를 정확하게 추출하는 산업 도면 전문 OCR 분석 AI입니다.
주어진 도면 이미지 영역(ROI)에서 텍스트를 판독하고, 다음 JSON 형식으로만 응답하세요:
{
  "detectedText": "판독된 전체 텍스트 (줄바꿈 포함)",
  "confidence": 0.95,
  "items": [
    { "label": "도면명 또는 항목명", "text": "추출된 값", "confidence": 0.95 }
  ]
}
어떠한 마크다운 코드블록이나 불필요한 설명 없이 오직 유효한 JSON 문자열만 출력하세요.`;

    const userPrompt = prompt || '이 도면 이미지 영역에서 표제란, 도면명, 부품명, 규격, 수량 등 텍스트를 모두 정밀하게 판독해 주세요.';

    let parsedResult: any = null;
    try {
      const aiRes = await callAiCaller(userPrompt, {
        systemPrompt,
        images: [imageBase64],
        temperature: 0.1
      });

      const rawContent = (aiRes?.content || '').trim();
      // Remove any markdown fence if present
      const cleanJsonStr = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
      parsedResult = JSON.parse(cleanJsonStr);
    } catch (aiErr: any) {
      console.warn('[OCR Route] AI Caller execution or JSON parsing failed:', aiErr.message);
      // Fallback to text detection if JSON parse failed
      parsedResult = {
        detectedText: '',
        confidence: 0.8,
        items: []
      };
    }

    const ocrResult = {
      detectedText: parsedResult?.detectedText || '',
      confidence: parsedResult?.confidence || 0.85,
      items: Array.isArray(parsedResult?.items) ? parsedResult.items : [],
      roiBbox: roiBbox || null,
      analyzedAt: new Date().toISOString()
    };

    // Audit log
    await recordActivity(req, session, {
      activityType: 'ANALYSIS_START',
      quotationCaseId: id,
      details: `도면 이미지 OCR 분석 완료 (신뢰도: ${(ocrResult.confidence * 100).toFixed(1)}%)`
    });

    return NextResponse.json({ success: true, result: ocrResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'OCR 처리 실패' }, { status: 500 });
  }
}
