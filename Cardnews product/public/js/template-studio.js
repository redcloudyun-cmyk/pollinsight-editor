const studioRequest = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다.');
  return data;
};
const html = value => String(value || '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[char]);
const tagsOf = template => { try { return Array.isArray(template.tags) ? template.tags : JSON.parse(template.tags || '[]'); } catch { return []; } };
let allTemplates = [], selectedTag = '';

function renderTemplateLibrary() {
  const search = document.querySelector('#template-search').value.trim().replace(/^#/, '').toLowerCase();
  const category = document.querySelector('#template-category').value;
  const visible = allTemplates.filter(template => {
    const tags = tagsOf(template);
    const searchable = `${template.title} ${template.category} ${tags.join(' ')}`.toLowerCase();
    return (!category || template.category === category) && (!selectedTag || tags.includes(selectedTag)) && (!search || searchable.includes(search));
  });
  const root = document.querySelector('#templates');
  root.innerHTML = visible.length ? visible.map(template => {
    const tags = tagsOf(template);
    return `<article class="card"><div class="preview">${template.preview_data ? `<img src="${template.preview_data}" alt="">` : '<i class="ph-duotone ph-layout text-4xl"></i>'}</div><div class="meta"><strong>${html(template.title)}</strong><small>${html(template.category)} · ${template.is_active ? '공개' : '비공개'}</small><div class="card-tags">${tags.map(tag => `<span data-card-tag="${html(tag)}">#${html(tag)}</span>`).join('')}</div><div class="actions"><button data-toggle="${template.id}" data-active="${template.is_active}">${template.is_active ? '비공개' : '공개'}</button><button class="secondary" data-delete="${template.id}">삭제</button></div></div></article>`;
  }).join('') : '<div class="empty">조건에 맞는 템플릿이 없습니다.</div>';
  root.querySelectorAll('[data-card-tag]').forEach(tag => tag.onclick = () => { selectedTag = tag.dataset.cardTag; renderTemplateLibrary(); renderTags(); });
  root.querySelectorAll('[data-toggle]').forEach(button => button.onclick = async () => { await studioRequest('/api/admin/templates/' + button.dataset.toggle, { method:'PATCH', body:JSON.stringify({ is_active: button.dataset.active !== 'true' }) }); await loadTemplateLibrary(); });
  root.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { if (!confirm('이 템플릿을 삭제할까요?')) return; await studioRequest('/api/admin/templates/' + button.dataset.delete, { method:'DELETE' }); await loadTemplateLibrary(); });
}
function renderTags() {
  const counts = new Map(); allTemplates.forEach(template => tagsOf(template).forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));
  document.querySelector('#template-tags').innerHTML = [...counts.entries()].sort((a,b) => b[1]-a[1]).map(([tag,count]) => `<button class="tag ${selectedTag === tag ? 'active':''}" data-tag="${html(tag)}">#${html(tag)} · ${count}</button>`).join('');
  document.querySelectorAll('[data-tag]').forEach(button => button.onclick = () => { selectedTag = selectedTag === button.dataset.tag ? '' : button.dataset.tag; renderTags(); renderTemplateLibrary(); });
}
async function loadTemplateLibrary() {
  const data = await studioRequest('/api/admin/templates'); allTemplates = data.templates || [];
  const select = document.querySelector('#template-category'); const current = select.value;
  select.innerHTML = '<option value="">모든 분류</option>' + [...new Set(allTemplates.map(template => template.category))].filter(Boolean).map(category => `<option value="${html(category)}">${html(category)}</option>`).join(''); select.value = current;
  renderTags(); renderTemplateLibrary();
}
window.addEventListener('load', async () => { try { const me = await studioRequest('/api/auth/me'); if (me.user.role !== 'admin') return location.replace('/index.html'); document.querySelector('#template-search').oninput = renderTemplateLibrary; document.querySelector('#template-category').onchange = renderTemplateLibrary; await loadTemplateLibrary(); } catch (error) { document.querySelector('#message').textContent = error.message; } });
