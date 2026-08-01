// 🎨 도화지(캔버스) 전체 공통 상태
const canvas = document.getElementById('cardCanvas');
const ctx = canvas.getContext('2d');
let globalBgColor = '#1a4e76';
let globalRadius = 16;
let globalFont = 'Pretendard';

// [구형 UI 정리] 상단에 있던 기존 고정형 텍스트 입력칸 숨기기
const oldTitleInput = document.getElementById('title-input');
const oldContentInput = document.getElementById('content-input');
if (oldTitleInput && oldTitleInput.parentElement) oldTitleInput.parentElement.style.display = 'none';
if (oldContentInput && oldContentInput.parentElement) oldContentInput.parentElement.style.display = 'none';

// 🎯 [핵심] 텍스트 및 이미지 객체 동적 관리 (무한 추가 가능)
let textElements = {}; // 객체들의 ID를 키로 사용하는 딕셔너리
let selectedElement = null;
let editingElement = null; // 현재 더블클릭하여 편집 중인 요소

// 🖱️ 마우스 제어 상태
let isDragging = false;
let isResizing = false; // 이미지 모서리 크기 조절 상태
let resizeHandle = null; // 'tl', 'tr', 'bl', 'br' 중 하나
let startMouseX = 0;
let startMouseY = 0;

// 캔버스 위에 겹쳐서 나타날 투명한 텍스트 편집기 생성
const inlineEditor = document.createElement('div');
inlineEditor.contentEditable = true;
inlineEditor.style.position = 'absolute';
inlineEditor.style.display = 'none';
inlineEditor.style.zIndex = '1000';
inlineEditor.style.background = 'rgba(255, 255, 255, 0.95)';
inlineEditor.style.border = '2px dashed #3b82f6';
inlineEditor.style.outline = 'none';
inlineEditor.style.whiteSpace = 'pre-wrap';
inlineEditor.style.wordBreak = 'keep-all';
inlineEditor.style.padding = '4px 8px';
inlineEditor.style.margin = '0';
inlineEditor.style.cursor = 'text';
inlineEditor.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
inlineEditor.style.borderRadius = '4px';
document.body.appendChild(inlineEditor);

// 객체 선택 시 우측에 나타나는 플로팅 툴바 생성
const floatingToolbar = document.createElement('div');
floatingToolbar.style.position = 'absolute';
floatingToolbar.style.display = 'none';
floatingToolbar.style.zIndex = '900';
floatingToolbar.style.background = 'white';
floatingToolbar.style.border = '1px solid #e2e8f0';
floatingToolbar.style.borderRadius = '12px';
floatingToolbar.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
floatingToolbar.style.padding = '6px';
floatingToolbar.style.flexDirection = 'column';
floatingToolbar.style.gap = '8px';
document.body.appendChild(floatingToolbar);

const btnStyle = "background:transparent; border:none; cursor:pointer; font-size:16px; padding:6px; border-radius:6px; transition:0.2s;";
floatingToolbar.innerHTML = `
    <button id="ft-layer-up" style="${btnStyle}" title="맨 앞으로 가져오기" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">⬆️</button>
    <button id="ft-layer-down" style="${btnStyle}" title="맨 뒤로 보내기" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">⬇️</button>
    <div style="height:1px; background:#e2e8f0; margin:2px 0;"></div>
    <button id="ft-lock" style="${btnStyle}" title="잠금/해제" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">🔓</button>
    <div style="height:1px; background:#e2e8f0; margin:2px 0;"></div>
    <button id="ft-copy" style="${btnStyle}" title="복제하기" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">📋</button>
    <button id="ft-delete" style="${btnStyle}" title="삭제하기" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='transparent'">🗑️</button>
`;

// 플로팅 툴바 이벤트 리스너
floatingToolbar.addEventListener('mousedown', (e) => e.stopPropagation());
document.getElementById('ft-layer-up').addEventListener('click', () => moveLayer(selectedElement, 'up'));
document.getElementById('ft-layer-down').addEventListener('click', () => moveLayer(selectedElement, 'down'));
document.getElementById('ft-delete').addEventListener('click', () => {
    if (!selectedElement) return;
    if (textElements[selectedElement].locked) { alert("잠금 해제 후 삭제할 수 있습니다."); return; }
    delete textElements[selectedElement];
    selectedElement = null;
    floatingToolbar.style.display = 'none';
    updateAdvancedPanelUI();
    drawCanvas();
});
document.getElementById('ft-lock').addEventListener('click', () => {
    if (!selectedElement) return;
    const el = textElements[selectedElement];
    el.locked = !el.locked;
    document.getElementById('ft-lock').innerText = el.locked ? '🔒' : '🔓';
    updateAdvancedPanelUI();
    drawCanvas();
});
document.getElementById('ft-copy').addEventListener('click', () => {
    if (!selectedElement) return;
    const el = textElements[selectedElement];
    const newId = el.type + '_' + Date.now();
    textElements[newId] = { ...el };
    textElements[newId].x += 20;
    textElements[newId].y += 20;
    textElements[newId].locked = false;
    selectedElement = newId;
    drawCanvas();
});

function moveLayer(id, dir) {
    if (!id) return;
    const keys = Object.keys(textElements);
    const idx = keys.indexOf(id);
    if (idx === -1) return;

    if (dir === 'up' && idx < keys.length - 1) {
        [keys[idx], keys[idx + 1]] = [keys[idx + 1], keys[idx]];
    } else if (dir === 'down' && idx > 0) {
        [keys[idx - 1], keys[idx]] = [keys[idx], keys[idx - 1]];
    } else { return; }

    const newObj = {};
    keys.forEach(k => { newObj[k] = textElements[k]; });
    textElements = newObj;
    drawCanvas();
}

function updateFloatingToolbar() {
    if (!selectedElement || editingElement || !textElements[selectedElement]) {
        floatingToolbar.style.display = 'none';
        return;
    }
    const el = textElements[selectedElement];
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    let rightX = 0; let topY = 0;

    if (el.type === 'image') {
        let drawW = el.width * (1 - (el.cropL || 0) - (el.cropR || 0));
        let drawX = el.x + (el.width * (el.cropL || 0));
        let drawY = el.y + (el.height * (el.cropT || 0));
        rightX = drawX + drawW; topY = drawY;
    } else {
        ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : 'normal '}${el.size}px ${globalFont}, sans-serif`;
        const lines = (el.text || '').split('\n');
        let maxWidth = 0;
        lines.forEach(line => { const w = ctx.measureText(line).width + (el.spacing * line.length); if (w > maxWidth) maxWidth = w; });
        let startX = el.x;
        if (el.align === 'center') startX = el.x - (maxWidth / 2);
        if (el.align === 'right') startX = el.x - maxWidth;
        rightX = startX + maxWidth;
        topY = el.y - (el.size / 2);
    }

    const screenX = rect.left + window.scrollX + (rightX * scaleX);
    const screenY = rect.top + window.scrollY + (topY * scaleY);

    floatingToolbar.style.left = (screenX + 15) + 'px';
    floatingToolbar.style.top = screenY + 'px';
    floatingToolbar.style.display = 'flex';
    document.getElementById('ft-lock').innerText = el.locked ? '🔒' : '🔓';
}

function drawCanvas(hideGuide = false) {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = globalBgColor;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, globalRadius);
    ctx.fill();

    const keys = Object.keys(textElements);
    keys.forEach(key => {
        const el = textElements[key];
        if (el.hidden) return;

        if (el.type === 'image') {
            el.cropL = el.cropL || 0; el.cropR = el.cropR || 0;
            el.cropT = el.cropT || 0; el.cropB = el.cropB || 0;

            let drawW = el.width * (1 - el.cropL - el.cropR);
            let drawH = el.height * (1 - el.cropT - el.cropB);
            let drawX = el.x + (el.width * el.cropL);
            let drawY = el.y + (el.height * el.cropT);

            let sX = el.baseWidth * el.cropL; let sY = el.baseHeight * el.cropT;
            let sW = el.baseWidth * (1 - el.cropL - el.cropR); let sH = el.baseHeight * (1 - el.cropT - el.cropB);

            ctx.shadowColor = 'transparent';
            ctx.drawImage(el.img, sX, sY, sW, sH, drawX, drawY, drawW, drawH);

            if (selectedElement === key && !editingElement && !hideGuide) {
                ctx.save();
                ctx.strokeStyle = el.locked ? '#94a3b8' : '#3b82f6';
                ctx.lineWidth = 2;
                ctx.setLineDash(el.locked ? [] : [5, 5]);
                ctx.strokeRect(drawX, drawY, drawW, drawH);

                if (!el.locked) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = 'white';
                    const hSize = 6;
                    const handles = [
                        { x: drawX, y: drawY }, { x: drawX + drawW, y: drawY },
                        { x: drawX, y: drawY + drawH }, { x: drawX + drawW, y: drawY + drawH }
                    ];
                    handles.forEach(h => {
                        ctx.beginPath();
                        ctx.arc(h.x, h.y, hSize, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.stroke();
                    });
                }
                ctx.restore();
            }
            return;
        }

        // 텍스트 렌더링 영역
        const fontStyle = el.italic ? 'italic ' : '';
        const fontWeight = el.bold ? 'bold ' : 'normal ';
        ctx.font = `${fontStyle}${fontWeight}${el.size}px ${globalFont}, sans-serif`;
        ctx.fillStyle = el.color;
        ctx.textAlign = el.align;
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = el.spacing + 'px';

        // 🌟 독립적인 텍스트 그림자 적용
        if (el.hasShadow) {
            ctx.shadowColor = el.shadowColor || 'rgba(0,0,0,0.5)';
            ctx.shadowOffsetX = el.shadowX || 0;
            ctx.shadowOffsetY = el.shadowY || 0;
            ctx.shadowBlur = el.shadowBlur || 0;
        } else {
            ctx.shadowColor = 'transparent';
        }

        const lines = (el.text || '텍스트를 입력하세요').split('\n');
        const lineHeightPx = el.size * el.lineHeight;

        lines.forEach((line, index) => {
            const posY = el.y + (index * lineHeightPx);

            // 윤곽선 그리기
            if (el.outlineWidth > 0) {
                ctx.lineWidth = el.outlineWidth;
                ctx.strokeStyle = el.outlineColor;
                ctx.lineJoin = 'round';
                ctx.strokeText(line, el.x, posY);
            }
            // 내부 칠하기
            ctx.fillText(line, el.x, posY);
        });

        // 그림자 초기화 (가이드라인이나 다른 객체에 영향 주지 않도록)
        ctx.shadowColor = 'transparent';

        if (selectedElement === key && !editingElement && !hideGuide) {
            ctx.save();
            let maxWidth = 0;
            lines.forEach(line => {
                const metrics = ctx.measureText(line);
                if (metrics.width > maxWidth) maxWidth = metrics.width;
            });
            const totalHeight = lines.length * lineHeightPx;
            const padding = 10;
            let startX = el.x;
            if (el.align === 'center') startX = el.x - (maxWidth / 2);
            if (el.align === 'right') startX = el.x - maxWidth;
            const startY = el.y - (el.size / 2);

            ctx.strokeStyle = el.locked ? '#94a3b8' : '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash(el.locked ? [] : [5, 5]);
            ctx.strokeRect(startX - padding, startY - padding, maxWidth + (padding * 2), totalHeight + (padding * 2) - (el.size - lineHeightPx));
            ctx.restore();
        }
    });

    if (!hideGuide) updateFloatingToolbar();
}

canvas.addEventListener('mousedown', (e) => {
    if (editingElement) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    if (selectedElement && textElements[selectedElement] && textElements[selectedElement].type === 'image' && !textElements[selectedElement].locked) {
        const el = textElements[selectedElement];
        let drawW = el.width * (1 - (el.cropL || 0) - (el.cropR || 0)); let drawH = el.height * (1 - (el.cropT || 0) - (el.cropB || 0));
        let drawX = el.x + (el.width * (el.cropL || 0)); let drawY = el.y + (el.height * (el.cropT || 0));
        const hSize = 10; // 핸들 타격 판정 넉넉하게
        const handles = { tl: { x: drawX, y: drawY }, tr: { x: drawX + drawW, y: drawY }, bl: { x: drawX, y: drawY + drawH }, br: { x: drawX + drawW, y: drawY + drawH } };
        for (let k in handles) {
            const h = handles[k];
            if (mouseX >= h.x - hSize && mouseX <= h.x + hSize && mouseY >= h.y - hSize && mouseY <= h.y + hSize) {
                isResizing = true; resizeHandle = k; startMouseX = mouseX; startMouseY = mouseY; return;
            }
        }
    }

    let clickedElement = null;
    const keys = Object.keys(textElements).reverse();
    for (let key of keys) {
        const el = textElements[key];
        if (el.hidden) continue;
        if (el.type === 'image') {
            let drawW = el.width * (1 - (el.cropL || 0) - (el.cropR || 0)); let drawH = el.height * (1 - (el.cropT || 0) - (el.cropB || 0));
            let drawX = el.x + (el.width * (el.cropL || 0)); let drawY = el.y + (el.height * (el.cropT || 0));
            if (mouseX >= drawX && mouseX <= drawX + drawW && mouseY >= drawY && mouseY <= drawY + drawH) { clickedElement = key; break; }
            continue;
        }
        ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : 'normal '}${el.size}px ${globalFont}, sans-serif`;
        ctx.letterSpacing = el.spacing + 'px';
        const lines = (el.text || '').split('\n');
        let maxWidth = 0;
        lines.forEach(line => { const width = ctx.measureText(line).width; if (width > maxWidth) maxWidth = width; });
        const totalHeight = (lines.length > 0 ? lines.length : 1) * (el.size * el.lineHeight);
        let startX = el.x;
        if (el.align === 'center') startX = el.x - (maxWidth / 2);
        if (el.align === 'right') startX = el.x - maxWidth;
        const startY = el.y - (el.size / 2);
        const padding = 15;

        if (mouseX >= startX - padding && mouseX <= startX + maxWidth + padding && mouseY >= startY - padding && mouseY <= startY + totalHeight + padding) {
            clickedElement = key; break;
        }
    }

    if (clickedElement) {
        selectedElement = clickedElement;
        const el = textElements[selectedElement];
        if (!el.locked) {
            isDragging = true; startMouseX = mouseX; startMouseY = mouseY;
        }
        updateAdvancedPanelUI();
    } else {
        selectedElement = null;
        document.getElementById('advanced-text-panel').style.display = 'none';
        floatingToolbar.style.display = 'none';
    }
    drawCanvas();
});

canvas.addEventListener('mousemove', (e) => {
    if (editingElement) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX; const mouseY = (e.clientY - rect.top) * scaleY;

    if (isResizing && selectedElement && textElements[selectedElement].type === 'image') {
        const el = textElements[selectedElement];
        let aspect = el.baseWidth / el.baseHeight;
        let currentDrawW = el.width * (1 - el.cropL - el.cropR); let currentDrawH = el.height * (1 - el.cropT - el.cropB);
        let currentDrawX = el.x + (el.width * el.cropL); let currentDrawY = el.y + (el.height * el.cropT);
        let visualAspect = currentDrawW / currentDrawH;

        if (resizeHandle === 'br') {
            let newDrawW = mouseX - currentDrawX;
            if (newDrawW > 30) { el.width = newDrawW / (1 - el.cropL - el.cropR); el.height = el.width / aspect; }
        } else if (resizeHandle === 'tl') {
            let pinX = currentDrawX + currentDrawW; let pinY = currentDrawY + currentDrawH; let newDrawW = pinX - mouseX;
            if (newDrawW > 30) { el.width = newDrawW / (1 - el.cropL - el.cropR); el.height = el.width / aspect; let newDrawH = newDrawW / visualAspect; el.x = (pinX - newDrawW) - (el.width * el.cropL); el.y = (pinY - newDrawH) - (el.height * el.cropT); }
        } else if (resizeHandle === 'tr') {
            let pinX = currentDrawX; let pinY = currentDrawY + currentDrawH; let newDrawW = mouseX - pinX;
            if (newDrawW > 30) { el.width = newDrawW / (1 - el.cropL - el.cropR); el.height = el.width / aspect; let newDrawH = newDrawW / visualAspect; el.y = (pinY - newDrawH) - (el.height * el.cropT); }
        } else if (resizeHandle === 'bl') {
            let pinX = currentDrawX + currentDrawW; let pinY = currentDrawY; let newDrawW = pinX - mouseX;
            if (newDrawW > 30) { el.width = newDrawW / (1 - el.cropL - el.cropR); el.height = el.width / aspect; el.x = (pinX - newDrawW) - (el.width * el.cropL); }
        }
        drawCanvas(); return;
    }

    if (isDragging && selectedElement) {
        const dx = mouseX - startMouseX; const dy = mouseY - startMouseY;
        textElements[selectedElement].x += dx; textElements[selectedElement].y += dy;
        startMouseX = mouseX; startMouseY = mouseY; drawCanvas(); return;
    }
});

canvas.addEventListener('mouseup', () => { isDragging = false; isResizing = false; resizeHandle = null; canvas.style.cursor = 'default'; });
canvas.addEventListener('mouseleave', () => { isDragging = false; isResizing = false; resizeHandle = null; canvas.style.cursor = 'default'; });

canvas.addEventListener('dblclick', () => {
    if (selectedElement && !editingElement) {
        if (textElements[selectedElement].type === 'image' || textElements[selectedElement].locked) return;
        openInlineEditor(selectedElement);
    }
});

const addTextBtnDiv = document.createElement('div');
addTextBtnDiv.style.margin = '20px 0';
addTextBtnDiv.innerHTML = `
    <button id="btn-add-text" style="width:100%; padding: 14px; background: #f8fafc; border: 2px dashed #94a3b8; border-radius: 8px; font-size:14px; font-weight: bold; color: #475569; cursor: pointer; transition: 0.2s; margin-bottom: 8px;">
        + 기본 텍스트 추가하기
    </button>
    <label for="img-upload" style="display:block; width:100%; padding: 14px; background: #f0fdf4; border: 2px dashed #4ade80; border-radius: 8px; font-size:14px; font-weight: bold; color: #166534; cursor: pointer; text-align:center; box-sizing:border-box; transition: 0.2s; margin-bottom: 8px;">
        🖼️ 내 PC 이미지 추가하기
    </label>
    <input type="file" id="img-upload" accept="image/png, image/jpeg" style="display:none;">
    
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px;">
        <label style="font-size:12px; font-weight:bold; color:#334155; margin-bottom:6px; display:block;">🔠 내 폰트 적용하기 (.ttf, .otf)</label>
        <input type="file" id="font-upload" accept=".ttf, .otf" style="width:100%; font-size:12px;">
    </div>
`;

const firstColorBox = document.querySelector('.color-box');
if (firstColorBox) { const panelSection = firstColorBox.closest('div').parentNode; panelSection.parentNode.insertBefore(addTextBtnDiv, panelSection); }

// 버튼 이벤트 바인딩
document.getElementById('btn-add-text').addEventListener('click', () => {
    const id = 'text_' + Date.now();
    textElements[id] = {
        type: 'text', text: '더블클릭하여 편집하세요', x: canvas.width / 2, y: canvas.height / 2,
        size: 40, bold: true, italic: false, spacing: 0, lineHeight: 1.5,
        outlineColor: '#000000', outlineWidth: 0,
        hasShadow: false, shadowX: 5, shadowY: 5, shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)',
        color: '#ffffff', align: 'center', hidden: false, locked: false
    };
    selectedElement = id; updateAdvancedPanelUI(); drawCanvas();
});

document.getElementById('img-upload').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            const id = 'img_' + Date.now();
            let w = img.width; let h = img.height; const maxW = canvas.width * 0.6;
            if (w > maxW) { h = h * (maxW / w); w = maxW; }
            textElements[id] = { type: 'image', img: img, x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, width: w, height: h, baseWidth: w, baseHeight: h, cropL: 0, cropR: 0, cropT: 0, cropB: 0, hidden: false, locked: false };
            selectedElement = id; updateAdvancedPanelUI(); drawCanvas();
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file); e.target.value = '';
});

document.getElementById('font-upload').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fontName = 'CustomFont_' + Date.now();
    const reader = new FileReader();
    reader.onload = function (event) {
        const fontFace = new FontFace(fontName, event.target.result);
        fontFace.load().then((loadedFace) => {
            document.fonts.add(loadedFace); globalFont = fontName;
            if (selectedElement && textElements[selectedElement].type === 'text') { drawCanvas(); }
            alert("✅ 폰트가 성공적으로 적용되었습니다!");
        }).catch((error) => { alert("❌ 폰트 로드에 실패했습니다: " + error); });
    };
    reader.readAsArrayBuffer(file);
});

// 🌟 고급 속성 패널 HTML 생성 (윤곽선/그림자 추가)
const advPanelDiv = document.createElement('div');
advPanelDiv.id = 'advanced-text-panel';
advPanelDiv.style.cssText = 'display: none; margin-top: 15px; padding: 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);';
advPanelDiv.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h4 id="adv-panel-title" style="margin:0; font-size:13px; color:#475569; font-weight:bold;">✨ 속성 조절</h4>
        <span style="font-size:11px; background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px; font-weight:bold;">선택됨</span>
    </div>
    
    <div id="adv-text-controls">
        <div style="display:flex; gap:10px; margin-bottom:12px;">
            <div style="flex:1;"><label style="font-size:11px; color:#64748b; display:block; margin-bottom:4px;">크기 (px)</label><input type="number" id="adv-size" style="width:100%; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; box-sizing:border-box;"></div>
            <div style="flex:1.2;"><label style="font-size:11px; color:#64748b; display:block; margin-bottom:4px;">스타일</label><div style="display:flex; gap:4px;"><button id="adv-bold" style="flex:1; padding:4px; font-weight:bold; cursor:pointer; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;">B</button><button id="adv-italic" style="flex:1; padding:4px; font-style:italic; cursor:pointer; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; font-family:serif;">I</button></div></div>
        </div>
        <div style="margin-bottom:12px;"><label style="font-size:11px; color:#64748b; display:flex; justify-content:space-between;">자간 <span id="adv-spacing-val" style="color:#0f172a; font-weight:bold;">0</span></label><input type="range" id="adv-spacing" min="-10" max="30" value="0" style="width:100%; margin-top:4px;"></div>
        <div style="margin-bottom:12px;"><label style="font-size:11px; color:#64748b; display:flex; justify-content:space-between;">행간 <span id="adv-lineheight-val" style="color:#0f172a; font-weight:bold;">1.5</span></label><input type="range" id="adv-lineheight" min="0.5" max="3" step="0.1" value="1.5" style="width:100%; margin-top:4px;"></div>
        
        <!-- 윤곽선 컨트롤 -->
        <div style="margin-bottom:12px; border-top:1px solid #f1f5f9; padding-top:10px;">
            <label style="font-size:12px; color:#334155; display:block; margin-bottom:6px; font-weight:bold;">테두리 (윤곽선)</label>
            <div style="display:flex; gap:8px; align-items:center;">
                <input type="color" id="adv-outline-color" value="#000000" style="width:28px; height:28px; padding:0; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;">
                <input type="range" id="adv-outline-width" min="0" max="15" value="0" style="flex:1;">
                <span id="adv-outline-val" style="font-size:11px; color:#0f172a; font-weight:bold; width:24px; text-align:right;">0px</span>
            </div>
        </div>

        <!-- 그림자 컨트롤 -->
        <div style="border-top:1px solid #f1f5f9; padding-top:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label style="font-size:12px; color:#334155; font-weight:bold;">그림자 효과</label>
                <label style="font-size:11px; display:flex; align-items:center; gap:4px; cursor:pointer;">
                    <input type="checkbox" id="adv-shadow-toggle"> <span>사용</span>
                </label>
            </div>
            <div id="adv-shadow-options" style="display:none; background:#f8fafc; padding:8px; border-radius:6px; border:1px solid #e2e8f0;">
                <div style="display:flex; gap:6px; margin-bottom:8px;">
                    <div style="flex:1"><span style="font-size:10px; color:#64748b; display:block; margin-bottom:2px;">가로 (X)</span><input type="number" id="adv-shadow-x" style="width:100%; padding:4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    <div style="flex:1"><span style="font-size:10px; color:#64748b; display:block; margin-bottom:2px;">세로 (Y)</span><input type="number" id="adv-shadow-y" style="width:100%; padding:4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;"></div>
                    <div style="flex:1"><span style="font-size:10px; color:#64748b; display:block; margin-bottom:2px;">블러 (Blur)</span><input type="number" id="adv-shadow-blur" style="width:100%; padding:4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;"></div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:10px; color:#64748b;">그림자 색상</span>
                    <input type="color" id="adv-shadow-color" style="width:28px; height:24px; padding:0; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;">
                </div>
            </div>
        </div>
    </div>
    
    <div id="adv-img-controls" style="display:none;">
        <label style="font-size:12px; color:#334155; display:block; margin-bottom:8px; font-weight:bold;">✂️ 캔버스 자르기 (Crop)</label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div><label style="font-size:10px; color:#64748b; display:flex; justify-content:space-between;">좌측 <span><span id="val-crop-l">0</span>%</span></label><input type="range" id="adv-crop-l" min="0" max="50" value="0" style="width:100%"></div>
            <div><label style="font-size:10px; color:#64748b; display:flex; justify-content:space-between;">우측 <span><span id="val-crop-r">0</span>%</span></label><input type="range" id="adv-crop-r" min="0" max="50" value="0" style="width:100%"></div>
            <div><label style="font-size:10px; color:#64748b; display:flex; justify-content:space-between;">상단 <span><span id="val-crop-t">0</span>%</span></label><input type="range" id="adv-crop-t" min="0" max="50" value="0" style="width:100%"></div>
            <div><label style="font-size:10px; color:#64748b; display:flex; justify-content:space-between;">하단 <span><span id="val-crop-b">0</span>%</span></label><input type="range" id="adv-crop-b" min="0" max="50" value="0" style="width:100%"></div>
        </div>
    </div>
`;
if (addTextBtnDiv) addTextBtnDiv.parentNode.insertBefore(advPanelDiv, addTextBtnDiv.nextSibling);

function updateAdvancedPanelUI() {
    if (!selectedElement || !textElements[selectedElement]) return;
    const el = textElements[selectedElement];
    document.getElementById('advanced-text-panel').style.display = 'block';

    if (el.locked) {
        document.getElementById('advanced-text-panel').style.opacity = '0.5';
        document.getElementById('advanced-text-panel').style.pointerEvents = 'none';
        document.getElementById('adv-panel-title').innerText = '🔒 잠긴 레이어 (속성 변경 불가)';
        return;
    } else {
        document.getElementById('advanced-text-panel').style.opacity = '1';
        document.getElementById('advanced-text-panel').style.pointerEvents = 'auto';
    }

    if (el.type === 'image') {
        document.getElementById('adv-panel-title').innerText = '🖼️ 이미지 상세 설정';
        document.getElementById('adv-text-controls').style.display = 'none'; document.getElementById('adv-img-controls').style.display = 'block';
        ['l', 'r', 't', 'b'].forEach(d => { document.getElementById(`adv-crop-${d}`).value = (el[`crop${d.toUpperCase()}`] || 0) * 100; document.getElementById(`val-crop-${d}`).innerText = (el[`crop${d.toUpperCase()}`] || 0) * 100; });
    } else {
        document.getElementById('adv-panel-title').innerText = '✨ 텍스트 상세 서식';
        document.getElementById('adv-text-controls').style.display = 'block'; document.getElementById('adv-img-controls').style.display = 'none';

        // 텍스트 속성 동기화
        document.getElementById('adv-size').value = el.size;
        document.getElementById('adv-bold').style.background = el.bold ? '#e2e8f0' : 'white';
        document.getElementById('adv-italic').style.background = el.italic ? '#e2e8f0' : 'white';
        document.getElementById('adv-spacing').value = el.spacing;
        document.getElementById('adv-spacing-val').innerText = el.spacing;
        document.getElementById('adv-lineheight').value = el.lineHeight;
        document.getElementById('adv-lineheight-val').innerText = el.lineHeight;

        // 윤곽선 동기화
        document.getElementById('adv-outline-color').value = el.outlineColor;
        document.getElementById('adv-outline-width').value = el.outlineWidth;
        document.getElementById('adv-outline-val').innerText = el.outlineWidth + 'px';

        // 그림자 동기화
        document.getElementById('adv-shadow-toggle').checked = el.hasShadow;
        document.getElementById('adv-shadow-options').style.display = el.hasShadow ? 'block' : 'none';
        document.getElementById('adv-shadow-x').value = el.shadowX;
        document.getElementById('adv-shadow-y').value = el.shadowY;
        document.getElementById('adv-shadow-blur').value = el.shadowBlur;

        // RGBA -> HEX 변환 (color input을 위해 단순화)
        let hexColor = '#000000';
        if (el.shadowColor && el.shadowColor.startsWith('#')) hexColor = el.shadowColor;
        document.getElementById('adv-shadow-color').value = hexColor;
    }
}

// 텍스트 속성 이벤트 바인딩
document.getElementById('adv-size').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].size = Number(e.target.value); drawCanvas(); } });
document.getElementById('adv-bold').addEventListener('click', () => { if (selectedElement) { textElements[selectedElement].bold = !textElements[selectedElement].bold; updateAdvancedPanelUI(); drawCanvas(); } });
document.getElementById('adv-italic').addEventListener('click', () => { if (selectedElement) { textElements[selectedElement].italic = !textElements[selectedElement].italic; updateAdvancedPanelUI(); drawCanvas(); } });
document.getElementById('adv-spacing').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].spacing = Number(e.target.value); updateAdvancedPanelUI(); drawCanvas(); } });
document.getElementById('adv-lineheight').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].lineHeight = Number(e.target.value); updateAdvancedPanelUI(); drawCanvas(); } });

// 윤곽선 이벤트
document.getElementById('adv-outline-color').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].outlineColor = e.target.value; drawCanvas(); } });
document.getElementById('adv-outline-width').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].outlineWidth = Number(e.target.value); updateAdvancedPanelUI(); drawCanvas(); } });

// 그림자 이벤트
document.getElementById('adv-shadow-toggle').addEventListener('change', (e) => {
    if (selectedElement) {
        textElements[selectedElement].hasShadow = e.target.checked;
        updateAdvancedPanelUI(); drawCanvas();
    }
});
document.getElementById('adv-shadow-x').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].shadowX = Number(e.target.value); drawCanvas(); } });
document.getElementById('adv-shadow-y').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].shadowY = Number(e.target.value); drawCanvas(); } });
document.getElementById('adv-shadow-blur').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].shadowBlur = Number(e.target.value); drawCanvas(); } });
document.getElementById('adv-shadow-color').addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement].shadowColor = e.target.value; drawCanvas(); } });

// 이미지 크롭 이벤트
['l', 'r', 't', 'b'].forEach(dir => { document.getElementById(`adv-crop-${dir}`).addEventListener('input', (e) => { if (selectedElement) { textElements[selectedElement][`crop${dir.toUpperCase()}`] = Number(e.target.value) / 100; document.getElementById(`val-crop-${dir}`).innerText = e.target.value; drawCanvas(); } }); });

function openInlineEditor(id) {
    editingElement = id; const el = textElements[id]; inlineEditor.innerText = el.text;
    const rect = canvas.getBoundingClientRect(); const scaleX = rect.width / canvas.width; const scaleY = rect.height / canvas.height;
    inlineEditor.style.font = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : 'normal '}${el.size * scaleY}px ${globalFont}, sans-serif`;
    inlineEditor.style.color = el.color; inlineEditor.style.lineHeight = el.lineHeight; inlineEditor.style.letterSpacing = (el.spacing * scaleX) + 'px'; inlineEditor.style.textAlign = el.align;
    const screenX = rect.left + window.scrollX + (el.x * scaleX); const screenY = rect.top + window.scrollY + ((el.y - (el.size / 2)) * scaleY);
    inlineEditor.style.top = screenY + 'px'; inlineEditor.style.minWidth = '100px';
    if (el.align === 'center') { inlineEditor.style.left = screenX + 'px'; inlineEditor.style.transform = 'translateX(-50%)'; } else if (el.align === 'right') { inlineEditor.style.left = screenX + 'px'; inlineEditor.style.transform = 'translateX(-100%)'; } else { inlineEditor.style.left = screenX + 'px'; inlineEditor.style.transform = 'none'; }
    inlineEditor.style.display = 'block'; inlineEditor.focus(); document.execCommand('selectAll', false, null);
    el.hidden = true; drawCanvas(); floatingToolbar.style.display = 'none';
}

inlineEditor.addEventListener('blur', () => { if (editingElement) { textElements[editingElement].text = inlineEditor.innerText || '텍스트를 입력하세요'; textElements[editingElement].hidden = false; editingElement = null; inlineEditor.style.display = 'none'; drawCanvas(); } });

window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement && !editingElement) {
        if (textElements[selectedElement].locked) return;
        delete textElements[selectedElement]; selectedElement = null;
        document.getElementById('advanced-text-panel').style.display = 'none';
        floatingToolbar.style.display = 'none'; drawCanvas();
    }
});

const colorBoxes = document.querySelectorAll('.color-box');
const colorHexInput = document.querySelector('.color-hex');
colorBoxes.forEach((box, index) => {
    box.addEventListener('click', () => {
        if (index < 4) { globalBgColor = box.style.background || box.style.backgroundColor; for (let i = 0; i < 4; i++) { colorBoxes[i].style.borderColor = '#d1d5db'; colorBoxes[i].style.borderWidth = '1px'; } box.style.borderColor = 'var(--primary)'; box.style.borderWidth = '2px'; }
        else {
            const targetColor = (box.style.background === 'rgb(51, 51, 51)' || box.style.backgroundColor === 'rgb(51, 51, 51)' || box.style.background === '#333333') ? '#ffffff' : '#333333';
            box.style.background = targetColor; if (colorHexInput) colorHexInput.value = targetColor.toUpperCase();
            if (selectedElement && textElements[selectedElement] && textElements[selectedElement].type !== 'image' && !textElements[selectedElement].locked) { textElements[selectedElement].color = targetColor; }
        } drawCanvas();
    });
});

const alignBtns = document.querySelectorAll('.align-btn');
const aligns = ['left', 'center', 'right', 'left'];
alignBtns.forEach((btn, index) => { btn.addEventListener('click', () => { alignBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); if (selectedElement && textElements[selectedElement] && textElements[selectedElement].type !== 'image' && !textElements[selectedElement].locked) { textElements[selectedElement].align = aligns[index]; drawCanvas(); } }); });

// 기존 하단 섀도우 슬라이더는 캔버스 둥근 모서리(Radius)로만 남김 (그림자는 개별 객체로 이동)
const sliders = document.querySelectorAll('input[type=range]:not(#adv-spacing):not(#adv-lineheight):not(#adv-outline-width):not([id^=adv-crop]):not([id^=adv-shadow])');
const sliderVals = document.querySelectorAll('.slider-val');
if (sliders.length >= 2) { sliders[1].addEventListener('input', (e) => { globalRadius = e.target.value; sliderVals[1].textContent = globalRadius + 'px'; drawCanvas(); }); }

const saveButton = document.getElementById('save-btn');
if (saveButton) {
    saveButton.addEventListener('click', () => {
        const tempSelected = selectedElement; selectedElement = null;
        if (editingElement) { textElements[editingElement].text = inlineEditor.innerText; textElements[editingElement].hidden = false; inlineEditor.style.display = 'none'; editingElement = null; }
        drawCanvas(true);
        setTimeout(() => {
            const dataURL = canvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a'); link.download = '폴인사이트_카드뉴스_' + Date.now() + '.png'; link.href = dataURL; document.body.appendChild(link); link.click(); document.body.removeChild(link);
            const exportData = { background: globalBgColor, radius: globalRadius, elements: textElements };
            console.log("DB 저장용 추출 데이터:", JSON.stringify(exportData));
            selectedElement = tempSelected; drawCanvas();
        }, 150);
    });
}

drawCanvas();