'use client';

import React, { useState } from 'react';
import {
  Printer, Download, Settings, FileSpreadsheet, CheckCircle2,
  ZoomIn, ZoomOut, RotateCcw, FileText, X, SlidersHorizontal
} from 'lucide-react';

export function numberToKoreanWon(num: number): string {
  if (!num || isNaN(num) || num <= 0) return '금 영 원정';
  const units = ['', '만', '억', '조'];
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const subUnits = ['', '십', '백', '천'];

  let strNum = Math.floor(num).toString();
  let result = '';
  let unitIdx = 0;

  while (strNum.length > 0) {
    const chunk = strNum.slice(-4);
    strNum = strNum.slice(0, -4);

    let chunkStr = '';
    for (let i = 0; i < chunk.length; i++) {
      const d = parseInt(chunk[chunk.length - 1 - i], 10);
      if (d > 0) {
        chunkStr = digits[d] + subUnits[i] + chunkStr;
      }
    }

    if (chunkStr) {
      result = chunkStr + units[unitIdx] + ' ' + result;
    }
    unitIdx++;
  }

  return '금 ' + result.trim() + ' 원정';
}

interface QuotationDocumentPreviewProps {
  quote: any;
  quoteItems: any[];
  caseData?: any;
  onExportExcel: (quoteId: string, customOptions?: any) => void;
  exportResult?: any;
  actionLoading?: boolean;
  onDownloadZip?: () => void;
}

export default function QuotationDocumentPreview({
  quote,
  quoteItems = [],
  caseData,
  onExportExcel,
  exportResult,
  actionLoading = false,
  onDownloadZip
}: QuotationDocumentPreviewProps) {
  // A4 Paper Zoom Scaling
  const [zoomScale, setZoomScale] = useState<number>(100);
  // Show only included items in quotation (default: true)
  const [onlyIncludedItems, setOnlyIncludedItems] = useState<boolean>(true);
  // Settings modal for supplier info & terms
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Editable Supplier & Quote Terms State
  const [supplierInfo, setSupplierInfo] = useState({
    businessNo: '',
    companyName: '',
    ceoName: '',
    address: '',
    bizType: '',
    bizCategory: '',
    tel: '',
    fax: '',
    email: '',
    manager: '',
    paymentTerms: '세금계산서 발행 후 30일 이내 현금 결제 (협의 가능)',
    deliveryTerms: '발주 확정 후 30일 이내 납품 (도면 승인 기준)',
    validityTerms: '견적 제출일로부터 30일간 유효',
    bankAccount: '',
    remarks: '1. 본 견적서는 CAD 도면 정밀 분석 기반 표준 산출 견적서입니다.\n2. 사양 변경 시 견적 금액이 변동될 수 있습니다.'
  });

  // Filter items based on user selection
  const displayedItems = onlyIncludedItems
    ? quoteItems.filter((qi: any) => qi.is_included !== 0)
    : quoteItems;

  // Calculate live subtotal, vat, total from displayed items
  const activeSubtotal = displayedItems.reduce((acc, qi) => acc + (Number(qi.amount) || 0), 0);
  const activeVat = Math.round(activeSubtotal * 0.1);
  const activeTotal = activeSubtotal + activeVat;
  const activeQtyTotal = displayedItems.reduce((acc, qi) => acc + (Number(qi.quantity) || 0), 0);

  // Client info from caseData
  const clientName = caseData?.case?.company_name || caseData?.company?.company_name || '고객사 귀하';
  const projectName = caseData?.case?.project_name || caseData?.project?.project_name || '-';
  const quoteNo = quote?.quote_no || '-';
  const quoteDate = quote?.quote_date ? quote.quote_date.split('T')[0] : new Date().toISOString().split('T')[0];

  // Native Browser High-Fidelity Vector Print / PDF Export
  const handlePrintPdf = () => {
    window.print();
  };

  if (!quote) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-4 shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
          <FileText className="w-7 h-7" />
        </div>
        <h4 className="text-slate-900 font-bold text-base">산출된 견적서가 없습니다</h4>
        <p className="text-slate-500 text-xs max-w-sm mx-auto">
          먼저 [2. 견적서 산출 & 단가] 탭에서 AI 1순위 추천 일괄 승인을 진행하여 견적서를 산출해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 🧭 Top Action Bar (Controls & Actions) - Hidden during print */}
      <div className="no-print bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 sticky top-3 z-20 backdrop-blur-md bg-white/95">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-slate-900 text-sm">표준 견적서 실물 A4 미리보기 (Print Preview)</h3>
              <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                {displayedItems.length}개 품목 표시 중
              </span>
            </div>
            <p className="text-slate-500 text-xs">
              출력 전 서식과 수식을 100% 실물 크기로 검토하고, 즉시 PDF로 인쇄하거나 Excel로 다운로드할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 text-xs">
            <button
              onClick={() => setZoomScale(Math.max(60, zoomScale - 10))}
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-white cursor-pointer"
              title="A4 용지 축소"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] font-bold text-slate-700 min-w-[45px] text-center">
              {zoomScale}%
            </span>
            <button
              onClick={() => setZoomScale(Math.min(140, zoomScale + 10))}
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-white cursor-pointer"
              title="A4 용지 확대"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomScale(100)}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-white cursor-pointer"
              title="100% 원본 배율 맞춤"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Included Items Filter Toggle */}
          <button
            onClick={() => setOnlyIncludedItems(!onlyIncludedItems)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              onlyIncludedItems
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-slate-100 border-slate-300 text-slate-600'
            }`}
            title="견적서에 포함된 품목만 표시할지 전체 품목을 표시할지 토글"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{onlyIncludedItems ? '견적 포함 품목만 보기' : '전체 품목 보기'}</span>
          </button>

          {/* Supplier Info & Terms Edit Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
            title="공급자 상호, 대표자명, 계좌번호, 특기사항 직접 수정"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>견적 조건/정보 편집</span>
          </button>

          {/* Primary Action 1: Export to Excel */}
          <button
            onClick={() => quote?.id && onExportExcel(quote.id, {
              supplier: {
                business_no: supplierInfo.businessNo,
                company_name: supplierInfo.companyName,
                ceo_name: supplierInfo.ceoName,
                address: supplierInfo.address,
                biz_type: supplierInfo.bizType,
                biz_category: supplierInfo.bizCategory,
                tel: supplierInfo.tel,
                fax: supplierInfo.fax,
                email: supplierInfo.email,
                manager: supplierInfo.manager
              },
              terms: {
                delivery_terms: supplierInfo.deliveryTerms,
                payment_terms: supplierInfo.paymentTerms,
                validity_terms: supplierInfo.validityTerms,
                bank_account: supplierInfo.bankAccount,
                remarks: supplierInfo.remarks
              }
            })}
            disabled={actionLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{actionLoading ? '엑셀 생성 중...' : 'Excel 다운로드'}</span>
          </button>

          {/* Primary Action 1-B: Download Entire Project ZIP Package */}
          {onDownloadZip && (
            <button
              onClick={onDownloadZip}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 cursor-pointer transition-colors"
              title="도면(DWG/DXF), 표제란, BOM 및 프로젝트 산출물 전체를 단일 압축 ZIP 파일로 내보냅니다."
            >
              <Download className="w-3.5 h-3.5 text-slate-300" />
              <span>전체 패키지(ZIP) 다운로드</span>
            </button>
          )}

          {/* Primary Action 2: PDF Export / Print */}
          <button
            onClick={handlePrintPdf}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center space-x-1.5 cursor-pointer transition-all"
            title="A4 표준 서식으로 PDF 저장 또는 종이 인쇄"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF 저장 / 인쇄</span>
          </button>
        </div>
      </div>

      {/* Excel Download Result Banner (if already exported) */}
      {exportResult && (
        <div className="no-print p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold text-emerald-950">엑셀 견적서 생성 및 총액 검증 완료!</span>
              <p className="text-emerald-800 text-[11px] mt-0.5">
                서버 총액(₩{exportResult.result?.server_total?.toLocaleString()})과 엑셀 수식 총액(₩{exportResult.result?.excel_total?.toLocaleString()})이 완벽히 일치합니다.
              </p>
            </div>
          </div>
          <a
            href={exportResult.downloadUrl}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-xs hover:bg-emerald-700 flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportResult.fileName} 받기</span>
          </a>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📄 REAL A4 PAPER PREVIEW CONTAINER                                       */}
      {/* ========================================================================= */}
      <div className="w-full overflow-x-auto flex justify-center py-6 bg-slate-200/80 rounded-2xl border border-slate-300/80 shadow-inner">
        <div
          style={{
            transform: `scale(${zoomScale / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out'
          }}
          className="print-paper-container"
        >
          {/* A4 Sheet Dimensions: 210mm x 297mm (Standard ratio, 820px width for screen rendering) */}
          <div
            id="quotation-print-area"
            className="w-[820px] min-h-[1140px] bg-white text-slate-900 p-10 shadow-2xl rounded-sm border border-slate-300 flex flex-col justify-between select-text"
          >
            <div>
              {/* 1. Header Title & Document Metadata */}
              <div className="border-b-2 border-slate-900 pb-4 mb-5">
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="text-3xl font-extrabold tracking-widest text-slate-900 font-sans">
                      견&nbsp;&nbsp;&nbsp;적&nbsp;&nbsp;&nbsp;서
                    </h1>
                    <span className="text-[11px] tracking-wider text-slate-500 font-bold uppercase block mt-1">
                      QUOTATION SPECIFICATION
                    </span>
                  </div>
                  <div className="text-right text-xs font-mono">
                    <div className="flex items-center justify-end space-x-2">
                      <span className="text-slate-500 font-sans font-bold">견적 번호:</span>
                      <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {quoteNo}
                      </span>
                    </div>
                    <div className="flex items-center justify-end space-x-2 mt-1">
                      <span className="text-slate-500 font-sans font-bold">견적 일자:</span>
                      <span className="font-bold text-slate-800">{quoteDate}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Dual Boxes: Client (수신처) & Supplier (공급자) */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                {/* Left: Client Box (공급받는자) */}
                <div className="border border-slate-300 rounded-lg p-3.5 bg-slate-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-baseline space-x-1.5 pb-2 border-b border-slate-200">
                      <span className="text-lg font-extrabold text-slate-900 underline decoration-slate-400 underline-offset-4">
                        {clientName}
                      </span>
                      <span className="text-sm font-bold text-slate-700">귀하</span>
                    </div>

                    <table className="w-full text-xs mt-3 space-y-1">
                      <tbody>
                        <tr className="leading-5">
                          <td className="w-20 text-slate-500 font-bold">프로젝트명</td>
                          <td className="font-bold text-slate-900">: {projectName}</td>
                        </tr>
                        <tr className="leading-5">
                          <td className="text-slate-500 font-bold">견적 유효기간</td>
                          <td className="text-slate-800">: {supplierInfo.validityTerms}</td>
                        </tr>
                        <tr className="leading-5">
                          <td className="text-slate-500 font-bold">납품 조건</td>
                          <td className="text-slate-800">: {supplierInfo.deliveryTerms}</td>
                        </tr>
                        <tr className="leading-5">
                          <td className="text-slate-500 font-bold">결제 조건</td>
                          <td className="text-slate-800">: {supplierInfo.paymentTerms}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-200 text-[11px] text-slate-600 font-medium italic">
                    아래와 같이 견적서를 제출하오니 검토하여 주시기 바랍니다.
                  </div>
                </div>

                {/* Right: Supplier Box (공급자 법정 양식) */}
                <div className="border border-slate-300 rounded-lg p-3 bg-white relative overflow-hidden">
                  <div className="text-[11px] font-bold text-slate-600 pb-1.5 mb-1.5 border-b border-slate-200 flex items-center justify-between">
                    <span>공 급 자 (Supplier)</span>
                    <span className="text-[10px] text-slate-400 font-normal">등록번호 대조필</span>
                  </div>

                  <table className="w-full text-xs border-collapse">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 px-1.5 text-slate-500 font-bold w-18 bg-slate-50">등록 번호</td>
                        <td colSpan={3} className="py-1 px-2 font-mono font-bold text-slate-900 tracking-wider">
                          {supplierInfo.businessNo}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 px-1.5 text-slate-500 font-bold bg-slate-50">상&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;호</td>
                        <td className="py-1 px-2 font-bold text-slate-900">{supplierInfo.companyName}</td>
                        <td className="py-1 px-1.5 text-slate-500 font-bold w-14 bg-slate-50 text-center">대 표 자</td>
                        <td className="py-1 px-2 font-bold text-slate-900 relative">
                          <span className="relative z-10">{supplierInfo.ceoName}</span>
                          {/* Official Corporate Red Stamp (직인 도장) */}
                          <div
                            className="absolute -top-3 right-0 w-14 h-14 pointer-events-none opacity-85 select-none"
                            title="주식회사 캐드온 직인"
                          >
                            <svg viewBox="0 0 100 100" className="w-full h-full text-red-600 rotate-6">
                              <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
                              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
                              <text
                                x="50"
                                y="38"
                                textAnchor="middle"
                                fontSize="13"
                                fontWeight="bold"
                                fill="currentColor"
                                fontFamily="sans-serif"
                              >
                                주식회사
                              </text>
                              <text
                                x="50"
                                y="56"
                                textAnchor="middle"
                                fontSize="14"
                                fontWeight="black"
                                fill="currentColor"
                                fontFamily="sans-serif"
                              >
                                캐 드 온
                              </text>
                              <text
                                x="50"
                                y="74"
                                textAnchor="middle"
                                fontSize="13"
                                fontWeight="bold"
                                fill="currentColor"
                                fontFamily="sans-serif"
                              >
                                대표이사
                              </text>
                            </svg>
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 px-1.5 text-slate-500 font-bold bg-slate-50">소 재 지</td>
                        <td colSpan={3} className="py-1 px-2 text-slate-800 text-[11px] leading-tight">
                          {supplierInfo.address}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 px-1.5 text-slate-500 font-bold bg-slate-50">업&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;태</td>
                        <td className="py-1 px-2 text-slate-800">{supplierInfo.bizType}</td>
                        <td className="py-1 px-1.5 text-slate-500 font-bold bg-slate-50 text-center">종&nbsp;&nbsp;&nbsp;&nbsp;목</td>
                        <td className="py-1 px-2 text-slate-800">{supplierInfo.bizCategory}</td>
                      </tr>
                      <tr>
                        <td className="py-1 px-1.5 text-slate-500 font-bold bg-slate-50">담당/연락</td>
                        <td colSpan={3} className="py-1 px-2 text-slate-800 text-[11px]">
                          {supplierInfo.manager} / TEL: {supplierInfo.tel}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Grand Total Amount Banner (프린트 최적화: 깔끔한 밝은 배경 + 단정한 테두리 서식) */}
              <div className="quotation-total-box bg-slate-50 border-2 border-slate-800 rounded-lg px-5 py-3 mb-5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded border border-slate-300">
                    견적 총액 (VAT 포함)
                  </span>
                  <span className="text-base font-extrabold tracking-wide font-sans text-slate-900">
                    {numberToKoreanWon(activeTotal)}
                  </span>
                </div>
                <div className="text-right flex items-baseline space-x-2">
                  <span className="text-xs text-slate-500 font-bold">합계:</span>
                  <span className="text-2xl font-black font-mono tracking-tight text-slate-900">
                    ₩{activeTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* 4. Itemized Quotation Specification Table */}
              <div className="border border-slate-300 rounded-lg overflow-hidden mb-5">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-[11px]">
                      <th className="py-2 px-2 text-center w-8 border-r border-slate-300">No</th>
                      <th className="py-2 px-3 border-r border-slate-300">품명 (Item Description)</th>
                      <th className="py-2 px-3 border-r border-slate-300">규격 및 사양 (Specification)</th>
                      <th className="py-2 px-2.5 text-center w-16 border-r border-slate-300">재질</th>
                      <th className="py-2 px-2.5 text-right w-14 border-r border-slate-300">수량</th>
                      <th className="py-2 px-2 text-center w-10 border-r border-slate-300">단위</th>
                      <th className="py-2 px-3 text-right w-24 border-r border-slate-300">단가 (원)</th>
                      <th className="py-2 px-3 text-right w-28 border-r border-slate-300">공급가액 (원)</th>
                      <th className="py-2 px-2.5 text-center w-14">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-sans text-[11px]">
                    {displayedItems.length > 0 ? (
                      displayedItems.map((item: any, idx: number) => {
                        const isEven = idx % 2 === 1;
                        return (
                          <tr key={item.id || idx} className={isEven ? 'bg-slate-50/60' : 'bg-white'}>
                            <td className="py-1.5 px-2 text-center font-mono text-slate-500 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-3 font-bold text-slate-900 border-r border-slate-200">
                              {item.item_name}
                            </td>
                            <td className="py-1.5 px-3 text-slate-700 border-r border-slate-200 truncate max-w-[170px]">
                              {item.specification || '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono text-slate-600 border-r border-slate-200">
                              {item.material || '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                              {item.quantity?.toLocaleString() || 1}
                            </td>
                            <td className="py-1.5 px-2 text-center text-slate-500 border-r border-slate-200">
                              {item.unit || 'EA'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono text-slate-800 border-r border-slate-200">
                              {Number(item.unit_price) > 0 ? `₩${Number(item.unit_price).toLocaleString()}` : '-'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                              {Number(item.amount) > 0 ? `₩${Number(item.amount).toLocaleString()}` : '-'}
                            </td>
                            <td className="py-1.5 px-2 text-center text-[10px] text-slate-400">
                              {item.remark || ''}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          견적에 포함된 품목이 없습니다.
                        </td>
                      </tr>
                    )}

                    {/* Aesthetic Blank Row Padding (to maintain professional full-page layout) */}
                    {displayedItems.length < 8 && (
                      Array.from({ length: 8 - displayedItems.length }).map((_, padIdx) => (
                        <tr key={`pad-${padIdx}`} className="border-b border-slate-100 text-transparent select-none">
                          <td className="py-1.5 px-2 text-center border-r border-slate-200">&nbsp;</td>
                          <td className="py-1.5 px-3 border-r border-slate-200">&nbsp;</td>
                          <td className="py-1.5 px-3 border-r border-slate-200">&nbsp;</td>
                          <td className="py-1.5 px-2.5 border-r border-slate-200">&nbsp;</td>
                          <td className="py-1.5 px-2.5 border-r border-slate-200">&nbsp;</td>
                          <td className="py-1.5 px-2 border-r border-slate-200">&nbsp;</td>
                          <td className="py-1.5 px-3 border-r border-slate-200">&nbsp;</td>
                          <td className="py-1.5 px-3 border-r border-slate-200">&nbsp;</td>
                          <td className="py-1.5 px-2">&nbsp;</td>
                        </tr>
                      ))
                    )}
                  </tbody>

                  {/* 5. Summary Breakdown Table Footer */}
                  <tfoot className="border-t-2 border-slate-400 bg-slate-50 font-bold text-slate-800 text-xs">
                    <tr className="border-b border-slate-200">
                      <td colSpan={4} className="py-2 px-3 text-right font-sans text-slate-600">
                        총 품목 수량 합계:
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-extrabold text-blue-700 border-r border-slate-300">
                        {activeQtyTotal.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-center border-r border-slate-300 text-slate-500">EA</td>
                      <td className="py-2 px-3 text-right font-sans text-slate-600 border-r border-slate-300">공급가액:</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900 border-r border-slate-300">
                        ₩{activeSubtotal.toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td colSpan={6} className="py-1.5 px-3 border-r border-slate-300 bg-white"></td>
                      <td className="py-1.5 px-3 text-right font-sans text-slate-600 border-r border-slate-300">
                        부가가치세 (10%):
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-900 border-r border-slate-300">
                        ₩{activeVat.toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                    <tr className="bg-slate-100 text-slate-900 text-[13px]">
                      <td colSpan={6} className="py-2 px-3 border-r border-slate-300 text-right font-sans font-bold text-slate-700">
                        총 견적 합계 금액 (Total):
                      </td>
                      <td colSpan={2} className="py-2 px-3 text-right font-mono font-black text-blue-700 border-r border-slate-300">
                        ₩{activeTotal.toLocaleString()}
                      </td>
                      <td className="text-center text-[10px] text-slate-500">VAT포함</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 6. Terms, Conditions, Bank Account & Special Notes */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 space-y-1.5">
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 flex items-center space-x-1">
                    <span>📌 특기 사항 및 견적 조건</span>
                  </div>
                  <div className="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed">
                    {supplierInfo.remarks}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 space-y-1.5">
                  <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 flex items-center space-x-1">
                    <span>💳 입금 및 결제 계좌 안내</span>
                  </div>
                  <div className="text-[11px] text-slate-700 space-y-1">
                    <div><strong className="text-slate-900">결제 계좌:</strong> {supplierInfo.bankAccount}</div>
                    <div><strong className="text-slate-900">결제 기한:</strong> {supplierInfo.paymentTerms}</div>
                    <div className="text-slate-500 text-[10px] pt-0.5">※ 전자세금계산서는 국세청 홈택스를 통해 자동 발행됩니다.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 7. Bottom Formal Closing Signature */}
            <div className="mt-8 pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <div>
                <span>본 견적서는 CADON-BOM AI 엔지니어링 시스템을 통해 공식 생성되었습니다.</span>
              </div>
              <div className="text-right font-sans font-bold text-slate-800">
                <span>{supplierInfo.companyName} 대표이사 {supplierInfo.ceoName}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ⚙️ Quotation Settings & Supplier Edit Modal (Interactive & User-friendly) */}
      {/* ========================================================================= */}
      {showSettingsModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto text-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">견적서 기본 정보 및 공급자 설정</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              견적서 인쇄물에 표시될 공급자 상호, 대표자, 연락처, 결제 계좌 등을 수정하면 실물 A4 서식에 즉시 반영됩니다.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">상호 (법인명)</label>
                <input
                  type="text"
                  value={supplierInfo.companyName}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, companyName: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">대표자명</label>
                <input
                  type="text"
                  value={supplierInfo.ceoName}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, ceoName: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">사업자등록번호</label>
                <input
                  type="text"
                  value={supplierInfo.businessNo}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, businessNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">대표 전화번호</label>
                <input
                  type="text"
                  value={supplierInfo.tel}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, tel: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">사업장 주소</label>
                <input
                  type="text"
                  value={supplierInfo.address}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, address: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">업태</label>
                <input
                  type="text"
                  value={supplierInfo.bizType}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, bizType: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">종목</label>
                <input
                  type="text"
                  value={supplierInfo.bizCategory}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, bizCategory: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">담당자 및 연락처</label>
                <input
                  type="text"
                  value={supplierInfo.manager}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, manager: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">입금 계좌번호</label>
                <input
                  type="text"
                  value={supplierInfo.bankAccount}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, bankAccount: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">결제 조건</label>
                <input
                  type="text"
                  value={supplierInfo.paymentTerms}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, paymentTerms: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">특기사항 (비고)</label>
                <textarea
                  rows={2}
                  value={supplierInfo.remarks}
                  onChange={(e) => setSupplierInfo({ ...supplierInfo, remarks: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                적용 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🖨️ A4 PRINT EXCLUSIVE STYLES (Pure Vector PDF Output Without UI Junk)     */}
      {/* ========================================================================= */}
      <style jsx global>{`
        @media print {
          /* Hide all screen UI elements: navigation, buttons, scrollbars, background bars */
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          nav, header, footer, .no-print, [class*="no-print"] {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }

          /* Force browser to print exact colors and backgrounds */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* A4 Portrait Page Margin Configuration */
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }

          .print-paper-container {
            transform: none !important;
            width: 100% !important;
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          #quotation-print-area {
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            padding: 0 !important;
            page-break-inside: avoid !important;
          }

          /* Avoid breaking rows inside table */
          table, tr, td, th {
            page-break-inside: avoid !important;
          }

          .quotation-total-box {
            background-color: #f8fafc !important;
            border: 1.5pt solid #1e293b !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
