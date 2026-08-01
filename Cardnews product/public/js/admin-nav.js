(() => {
  const header = document.querySelector('header.top');
  if (!header) return;
  const current = location.pathname;
  const section = current.includes('template-studio') ? '완성형 템플릿' : current.includes('asset-studio') ? '개별 요소 라이브러리' : current.includes('admin') ? '회원 관리' : '관리';
  const links = [
    ['/admin.html', '회원 관리', current.includes('admin.html')],
    ['/template-studio.html', '완성형 템플릿', current.includes('template-studio')],
    ['/asset-studio.html', '개별 요소', current.includes('asset-studio')],
    ['/index.html', '편집기', current === '/index.html']
  ];
  header.classList.add('global-admin-nav');
  header.innerHTML = `<a class="global-brand" href="/workspace.html"><span class="mark">PI</span><strong>POLLINSIGHT</strong><span class="global-section">${section}</span></a><nav>${links.map(([href, label, active]) => `<a href="${href}" class="${active ? 'active' : ''}">${label}</a>`).join('')}</nav>`;
  const style = document.createElement('style');
  style.textContent = `.global-admin-nav{height:72px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:0 38px!important;gap:24px;background:#101a2c!important;border-bottom:1px solid #293956!important}.global-brand{display:flex;align-items:center;gap:10px;color:#fff!important;font-size:15px;text-decoration:none!important}.global-brand .mark{display:inline-block;color:#fff}.global-section{font-size:12px;font-weight:700;color:#9eb0ca;padding-left:10px;border-left:1px solid #405571}.global-admin-nav nav{display:flex;align-items:center;gap:5px}.global-admin-nav nav a{padding:9px 11px;border-radius:7px;color:#a9c5ee;text-decoration:none;font-size:13px;font-weight:700}.global-admin-nav nav a:hover{background:#17263d;color:#fff}.global-admin-nav nav a.active{background:#2563eb;color:#fff}@media(max-width:700px){.global-admin-nav{height:auto!important;min-height:58px;padding:10px 14px!important;align-items:flex-start!important;flex-direction:column}.global-admin-nav nav{width:100%;overflow:auto}.global-admin-nav nav a{white-space:nowrap;padding:6px 8px;font-size:12px}.global-section{display:none}}`;
  document.head.appendChild(style);
})();
