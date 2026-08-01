import { AppState } from './AppState.js';
import { CanvasEngine } from './CanvasEngine.js';
import { EventManager } from './EventManager.js';
import { UIController } from './UIController.js';
import { HistoryManager } from './HistoryManager.js';
import { ProjectService } from './ProjectService.js';

const partyThemes = {
    democratic: { accent: '#2563eb', dark: '#1d4ed8', name: '민주당 계열' },
    people_power: { accent: '#dc2626', dark: '#b91c1c', name: '국민의힘 계열' },
    justice: { accent: '#eab308', dark: '#ca8a04', name: '정의당 계열' },
    independent: { accent: '#64748b', dark: '#475569', name: '무소속' }
};
const API_BASE = window.location.port === '3000' ? '' : 'http://localhost:3000';
const api = path => `${API_BASE}${path}`;

async function loadSession() {
    const response = await fetch(api('/api/auth/me'), { credentials: 'include' });
    if (!response.ok) { window.location.replace('/login.html'); return null; }
    const { user } = await response.json();
    const theme = partyThemes[user.party] || partyThemes.independent;
    document.documentElement.style.setProperty('--party-accent', theme.accent);
    document.documentElement.style.setProperty('--party-accent-dark', theme.dark);
    document.body.dataset.party = user.party;
    document.body.dataset.role = user.role;
    document.getElementById('account-name').textContent = user.displayName;
    document.getElementById('account-tier').textContent = ({ free: '무료', basic: '베이직', premium: '프리미엄' })[user.tier] || user.tier;
    if (user.role === 'admin') document.getElementById('btn-admin').classList.remove('hidden');
    document.getElementById('btn-logout').onclick = async () => { await fetch(api('/api/auth/logout'), { method: 'POST', credentials: 'include' }); window.location.replace('/login.html'); };
    return user;
}

window.addEventListener('load', async () => {
    if (!(await loadSession())) return;
    console.log("🚀 폴인사이트 디자인 스튜디오 기동 시작!");

    const canvas = document.getElementById('cardCanvas');
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }

    // Initialize module engines
    CanvasEngine.init(canvas);
    const projectId = new URLSearchParams(window.location.search).get('project');
    const hasPendingProposal = new URLSearchParams(window.location.search).get('proposal') === '1';
    let pendingProposal = null;
    try {
        if (projectId) await ProjectService.loadServerProject(projectId);
        else if (hasPendingProposal) {
            const raw = sessionStorage.getItem('pollinsight-pending-proposal');
            if (!raw) throw new Error('선택한 시안을 찾을 수 없습니다. 제안 화면에서 다시 선택해 주세요.');
            pendingProposal = JSON.parse(raw);
            ProjectService.currentProjectId = null;
            ProjectService.currentFolderId = null;
            ProjectService.applyProject(pendingProposal);
            sessionStorage.removeItem('pollinsight-pending-proposal');
        }
        else ProjectService.restoreDraft();
    } catch (error) {
        alert(error.message || '저장된 프로젝트를 불러올 수 없습니다.');
        ProjectService.restoreDraft();
    }
    EventManager.init();
    UIController.init();

    // Save initial canvas state
    HistoryManager.save();
    ProjectService.enableAutoSave();
    // Active editor time is recorded in coarse one-minute heartbeats; it is
    // usage analytics, not a background tracker when the tab is hidden.
    window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        fetch(api('/api/usage/heartbeat'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: 60 }) }).catch(() => {});
    }, 60000);

    // Auto fit to screen
    setTimeout(async () => {
        UIController.zoomToFit();
        CanvasEngine.draw();
        if (pendingProposal) {
            const result = await ProjectService.saveToDB(pendingProposal.title);
            if (result.success && ProjectService.currentProjectId) {
                history.replaceState({}, '', `/index.html?project=${ProjectService.currentProjectId}`);
                alert('선택한 AI 시안이 내 작업에 저장되었습니다. 이제 각 요소를 직접 편집할 수 있습니다.');
            } else {
                alert(result.message || '시안은 열렸지만 서버 저장에 실패했습니다. 저장 버튼으로 다시 저장해 주세요.');
            }
        }
    }, 150);
});
