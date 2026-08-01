const api = path => (location.port === '3000' ? '' : 'http://localhost:3000') + path;
const fields = ['candidate-name', 'keyword', 'party', 'region', 'number', 'promise'];
let proposals = [];
let portraitData = '';

const value = id => document.getElementById(id)?.value.trim() || '';
const displayTitle = () => value('keyword') || '지역의 새로운 변화';
const displayDetail = () => [value('number') && `기호 ${value('number')}`, value('region')].filter(Boolean).join(' · ') || '캠페인 정보';
const message = text => { const chat = document.getElementById('chat'); if (chat) chat.textContent = text; };

function refreshPreviews() {
    document.querySelectorAll('[data-title]').forEach(item => {
        item.textContent = displayTitle();
    });
    document.querySelectorAll('[data-stat]').forEach(item => item.textContent = displayDetail());
    const copy = document.getElementById('proposal-copy');
    if (copy) copy.textContent = `'${displayTitle()}'을 중심으로 서로 다른 세 가지 시각 방향을 준비합니다.`;
}

function previewProposal(proposal) {
    const state = proposal?.state;
    const cover = state?.pages?.[0]?.els || {};
    const title = cover.title?.text || displayTitle();
    const subtitle = cover.subtitle?.text || value('promise');
    const candidate = cover.candidate?.text || '';
    document.querySelectorAll(`.design[data-style="${proposal.id}"]`).forEach(card => {
        const titleNode = card.querySelector('[data-title]');
        if (titleNode) titleNode.textContent = title;
        const statNode = card.querySelector('[data-stat]');
        if (statNode) statNode.textContent = candidate || displayDetail();
        card.title = `${proposal.name}: ${subtitle}`;
    });
}

async function readPortrait(file) {
    if (!file) return '';
    if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 사용할 수 있습니다.');
    if (file.size > 7 * 1024 * 1024) throw new Error('사진은 7MB 이하로 올려 주세요.');
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('사진을 읽을 수 없습니다.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

async function generate() {
    const button = document.getElementById('generate');
    if (!value('keyword') && !value('promise')) {
        message('먼저 키워드 또는 핵심 공약을 입력해 주세요.');
        return;
    }
    button.disabled = true;
    button.textContent = '3개 시안을 구성하는 중…';
    message('입력한 사실은 그대로 유지하고, 인물·정보·메시지 중심의 세 가지 구성을 만들고 있습니다.');
    try {
        const response = await fetch(api('/api/ai/proposals'), {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                candidateName: value('candidate-name'), keyword: value('keyword'), party: value('party'), region: value('region'), number: value('number'),
                promise: value('promise'), portrait: portraitData
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || '시안을 만들 수 없습니다.');
        proposals = result.proposals || [];
        proposals.forEach(previewProposal);
        const questions = (result.questions || []).filter(Boolean);
        message(questions.length ? `AI 질문: ${questions[0]}` : '세 가지 시안이 준비되었습니다. 마음에 드는 방향을 선택해 편집을 시작하세요.');
        document.querySelectorAll('.choose').forEach(button => button.disabled = !proposals.some(item => item.id === button.dataset.style));
    } catch (error) {
        message(error.message || '시안 생성 중 문제가 발생했습니다.');
    } finally {
        button.disabled = false;
        button.textContent = 'AI로 3가지 시안 만들기';
    }
}

function choose(style) {
    const proposal = proposals.find(item => item.id === style);
    if (!proposal) {
        message('먼저 AI 시안 만들기를 눌러 주세요.');
        return;
    }
    sessionStorage.setItem('pollinsight-pending-proposal', JSON.stringify(proposal.state));
    location.href = '/index.html?proposal=1';
}

async function init() {
    const response = await fetch(api('/api/auth/me'), { credentials: 'include' });
    if (!response.ok) return location.replace('/login.html');
    const user = (await response.json()).user;
    const palette = { democratic: '#2563eb', people_power: '#dc2626', justice: '#d99000', independent: '#64748b' };
    document.documentElement.style.setProperty('--accent', palette[user.party] || palette.independent);
    refreshPreviews();
}

document.getElementById('portrait-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    document.getElementById('photo-name').textContent = file ? file.name : '사진을 선택하지 않았습니다.';
    try { portraitData = await readPortrait(file); }
    catch (error) { portraitData = ''; message(error.message); event.target.value = ''; }
});
document.getElementById('generate')?.addEventListener('click', generate);
document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => {
    const promise = document.getElementById('promise');
    if (promise && !promise.value) promise.value = button.dataset.question || '';
    message('질문 내용을 입력값에 반영했습니다. 시안 생성 버튼을 눌러 다시 제안받으세요.');
    refreshPreviews();
}));
document.querySelectorAll('.choose').forEach(button => button.addEventListener('click', () => choose(button.dataset.style)));
fields.forEach(id => document.getElementById(id)?.addEventListener('input', refreshPreviews));
init();
