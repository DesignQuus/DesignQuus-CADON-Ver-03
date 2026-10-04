# -*- coding: utf-8 -*-
import sys

def update_case_detail():
    path = 'src/app/cases/[id]/page.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    old_block = """  // URL step 쿼리 파라미터 연동 (?step=1, ?step=2, ?step=3)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const stepParam = sp.get('step');
      if (stepParam === '1') {
        setWorkflowStep(1);
        setIsSidebarOpen(true);
      } else if (stepParam === '2') {
        setWorkflowStep(2);
      } else if (stepParam === '3') {
        setWorkflowStep(3);
      }
    }
  }, []);"""

    new_block = """  // URL step 및 tab 쿼리 파라미터 연동 (?step=1~5, ?tab=bom, ?tab=quote 등)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const stepParam = sp.get('step');
      const tabParam = sp.get('tab');
      if (stepParam === '1') {
        setWorkflowStep(1);
        setIsSidebarOpen(true);
      } else if (stepParam === '2') {
        setWorkflowStep(2);
      } else if (stepParam === '3' || tabParam === 'bom' || tabParam === 'sheet') {
        setWorkflowStep(3);
      } else if (stepParam === '4' || tabParam === 'review' || tabParam === 'price') {
        router.push(`/quotes/${id}/review`);
      } else if (stepParam === '5' || tabParam === 'publish') {
        router.push(`/quotes/${id}/publish`);
      } else if (tabParam === 'quote') {
        setActiveTab('quote');
      } else if (tabParam === 'approval') {
        setActiveTab('approval');
      } else if (tabParam === 'structure') {
        setActiveTab('structure');
      } else if (tabParam === 'excel') {
        setActiveTab('excel');
      }
    }
  }, [id, router]);"""

    # Normalize CRLF
    content_norm = content.replace('\r\n', '\n')
    old_norm = old_block.replace('\r\n', '\n')
    new_norm = new_block.replace('\r\n', '\n')

    if old_norm in content_norm:
        content_norm = content_norm.replace(old_norm, new_norm, 1)
        # Restore CRLF
        content = content_norm.replace('\n', '\r\n')
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(content)
        print('Updated src/app/cases/[id]/page.tsx')
    else:
        print('Warning: old_block not found in src/app/cases/[id]/page.tsx')

def update_sidebar():
    path = 'src/components/cases/CaseWorkflowSidebar.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    target = 'href={`/cases/${latestReadyCase.id}?tab=quote`}'
    replacement = 'href={`/quotes/${latestReadyCase.id}/publish`}'
    if target in content:
        content = content.replace(target, replacement, 1)
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(content)
        print('Updated src/components/cases/CaseWorkflowSidebar.tsx')
    else:
        print('Warning: target not found in CaseWorkflowSidebar.tsx')

if __name__ == '__main__':
    update_case_detail()
    update_sidebar()
