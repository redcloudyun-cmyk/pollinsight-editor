import { AppState } from './AppState.js';
import { CanvasEngine } from './CanvasEngine.js';
import { HistoryManager } from './HistoryManager.js';
import { ProjectService } from './ProjectService.js';

export const UIController = {
    init: function () {
        this.bindTabs();
        this.bindMobileLayout();
        this.bindCanvasPresets();
        this.moveSlideControlsToPageTab();
        this.bindAddElements();
        this.bindZoomControls();
        this.bindProjectControls();
        this.bindRightPanelControls();
        this.bindFontPicker();
        this.bindLineControls();
        this.bindTableControls();
        this.bindChartControls();
        this.bindAIControls();
        this.bindPresentationMode();
        this.bindTemplates();
        this.bindSharedAssetLibrary();
        this.bindTemplateStudio();
        this.bindGroupControls();
        this.bindSidePageControls();
        this.bindPageWheelNavigation();
        requestAnimationFrame(() => {
            this.refreshPageNavigationStatus();
            this.syncCanvasOverlayScale();
        });

        // Register globally for event bindings to find
        window.updateUIFromCanvasState = this.updatePanels.bind(this);
    },

    moveSlideControlsToPageTab: function () {
        const slideControls = document.getElementById('page-background-controls');
        const pageTab = document.getElementById('tab-pages');
        const pageList = document.getElementById('page-list');
        if (!slideControls || !pageTab || !pageList) return;

        // Slide settings belong to the page workflow, not the selected-element inspector.
        slideControls.className = 'p-4 space-y-4 border-b border-slate-800 bg-slate-900';
        const listHeading = pageList.previousElementSibling;
        pageTab.insertBefore(slideControls, listHeading || pageList);
    },

    bindTabs: function () {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.querySelector('.indicator')?.classList.add('hidden');
                });
                document.querySelectorAll('.tab-content').forEach(c => {
                    c.classList.remove('active');
                    c.classList.add('hidden');
                });
                
                btn.classList.add('active');
                btn.querySelector('.indicator')?.classList.remove('hidden');
                
                const target = document.getElementById(btn.dataset.target);
                if (target) {
                    target.classList.remove('hidden');
                    target.classList.add('active');
                }
                if (window.matchMedia('(max-width: 900px)').matches) this.openMobilePanel('tools');
            }
        });
    },

    bindMobileLayout: function () {
        const tools = document.getElementById('left-panel');
        const properties = document.getElementById('properties-panel');
        const backdrop = document.getElementById('mobile-backdrop');
        const toolButton = document.getElementById('btn-mobile-tools');
        const propertyButton = document.getElementById('btn-mobile-properties');
        if (!tools || !properties || !backdrop) return;

        this.closeMobilePanels = () => {
            tools.classList.remove('mobile-panel-open');
            properties.classList.remove('mobile-panel-open');
            backdrop.classList.remove('is-visible');
        };
        this.openMobilePanel = (which) => {
            if (!window.matchMedia('(max-width: 900px)').matches) return;
            const next = which === 'tools' ? tools : properties;
            const wasOpen = next.classList.contains('mobile-panel-open');
            this.closeMobilePanels();
            if (!wasOpen) {
                next.classList.add('mobile-panel-open');
                backdrop.classList.add('is-visible');
            }
        };

        toolButton?.addEventListener('click', () => this.openMobilePanel('tools'));
        propertyButton?.addEventListener('click', () => this.openMobilePanel('properties'));
        backdrop.addEventListener('click', () => this.closeMobilePanels());

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (!window.matchMedia('(max-width: 900px)').matches) this.closeMobilePanels();
                this.zoomToFit();
            }, 120);
        });
    },

    bindCanvasPresets: function () {
        const preset = document.getElementById('canvas-preset');
        if (preset) {
            preset.onchange = (e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                const cw = document.getElementById('canvas-w');
                const ch = document.getElementById('canvas-h');
                if (cw && ch) {
                    cw.value = w;
                    ch.value = h;
                }
                const page = AppState.getPage();
                if (page) {
                    page.w = w;
                    page.h = h;
                    HistoryManager.save();
                    CanvasEngine.draw();
                    this.zoomToFit();
                }
            };
        }

        const btnResize = document.getElementById('btn-resize-canvas');
        if (btnResize) {
            btnResize.onclick = () => {
                const cw = Number(document.getElementById('canvas-w').value);
                const ch = Number(document.getElementById('canvas-h').value);
                const page = AppState.getPage();
                if (page) {
                    page.w = cw;
                    page.h = ch;
                    HistoryManager.save();
                    CanvasEngine.draw();
                    this.zoomToFit();
                }
            };
        }

        const chkGrid = document.getElementById('chk-show-grid');
        if (chkGrid) {
            chkGrid.onchange = (e) => {
                AppState.showGrid = e.target.checked;
                CanvasEngine.draw();
            };
        }

        const chkSnap = document.getElementById('chk-snap-align');
        if (chkSnap) {
            chkSnap.onchange = (e) => {
                AppState.snapEnabled = e.target.checked;
            };
        }
    },

    bindAddElements: function () {
        const cv = CanvasEngine.canvas;
        
        // Text
        const addText = document.getElementById('add-text');
        if (addText) {
            addText.onclick = () => {
                const id = 'text_' + Math.random().toString(36).substring(2, 9);
                AppState.getEls()[id] = {
                    type: 'text',
                    text: '가운데 정렬 텍스트',
                    x: cv.width / 2,
                    y: cv.height / 2,
                    w: 240,
                    h: 80,
                    size: 55,
                    color: '#1e293b',
                    align: 'center',
                    font: 'Pretendard',
                    rot: 0,
                    opacity: 1
                };
                AppState.selectedIds = [id];
                HistoryManager.save();
                CanvasEngine.draw();
            };
        }

        const bindShapeBtn = (btnId, shapeType, extraStyles = {}) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.onclick = () => {
                    const id = shapeType + '_' + Math.random().toString(36).substring(2, 9);
                    AppState.getEls()[id] = {
                        type: shapeType,
                        x: cv.width / 2 - 100,
                        y: cv.height / 2 - 100,
                        w: 200,
                        h: 200,
                        color: '#2563eb',
                        rot: 0,
                        opacity: 1,
                        ...extraStyles
                    };
                    AppState.selectedIds = [id];
                    HistoryManager.save();
                    CanvasEngine.draw();
                };
            }
        };

        bindShapeBtn('add-rect', 'rect', { borderRadius: 0 });
        bindShapeBtn('add-circle', 'circle');
        bindShapeBtn('add-triangle', 'triangle');
        bindShapeBtn('add-star', 'star', { spikes: 5, innerRadiusRatio: 0.4 });
        bindShapeBtn('add-polygon', 'polygon', { sides: 6 });
        bindShapeBtn('add-line', 'line', { w: 200, h: 0, strokeWidth: 4, color: '#334155', lineStyle: 'solid', lineCap: 'butt', startCap: 'none', endCap: 'none', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] });
        bindShapeBtn('add-arrow', 'line', { w: 200, h: 0, strokeWidth: 5, color: '#2563eb', lineStyle: 'solid', lineCap: 'butt', startCap: 'none', endCap: 'arrow', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] });

        // Image file upload
        const imgUpload = document.getElementById('img-upload');
        if (imgUpload) {
            imgUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                this.addImageFromFile(file);
                e.target.value = '';
            });
        }

        document.addEventListener('design:image-file', (event) => {
            const files = event.detail?.files || [];
            files.forEach(file => this.addImageFromFile(file));
        });

        // Font upload is rendered in the text inspector, not in the asset panel.
        document.getElementById('legacy-font-upload')?.closest('.relative')?.classList.add('hidden');
        // Legacy listener remains harmless because its former id is no longer present.
        const fontUpload = document.getElementById('font-upload');
        if (fontUpload) {
            fontUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const fontName = 'Font_' + Date.now();
                const reader = new FileReader();
                reader.onload = function (event) {
                    const fontFace = new FontFace(fontName, event.target.result);
                    fontFace.load().then((loaded) => {
                        document.fonts.add(loaded);
                        
                        // Apply immediately to selection
                        const selected = AppState.getSelectedEls();
                        selected.forEach(el => {
                            if (el.type === 'text') el.font = fontName;
                        });
                        HistoryManager.save();
                        CanvasEngine.draw();
                        alert("폰트 파일이 추가 및 적용되었습니다!");
                    }).catch(err => alert("폰트 파일 로드 오류"));
                };
                reader.readAsArrayBuffer(file);
            });
        }
    },

    addImageFromFile: function (file) {
        if (!file || !file.type?.startsWith('image/')) return;
        const cv = CanvasEngine.canvas;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, 600 / Math.max(img.width, img.height));
                const id = 'img_' + Math.random().toString(36).substring(2, 9);
                AppState.getEls()[id] = {
                    type: 'image', imgSrc: event.target.result, img,
                    x: CanvasEngine.getPageWidth() / 2 - (img.width * scale) / 2,
                    y: CanvasEngine.getPageHeight() / 2 - (img.height * scale) / 2,
                    w: img.width * scale, h: img.height * scale, rot: 0, opacity: 1
                };
                AppState.selectedIds = [id];
                HistoryManager.save();
                CanvasEngine.draw();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    },

    bindProjectControls: function () {
        const title = () => document.getElementById('project-title')?.value || 'untitled-design';
        const newProject = document.getElementById('btn-new-project');
        if (newProject) newProject.onclick = () => {
            if (!confirm('현재 작업을 새 빈 프로젝트로 바꿀까요? 저장하지 않은 변경사항은 자동 임시저장에 남습니다.')) return;
            ProjectService.newProject();
            HistoryManager.stack = [];
            HistoryManager.index = -1;
            HistoryManager.save();
            CanvasEngine.draw();
            this.zoomToFit();
        };

        const openButton = document.getElementById('btn-open-project');
        const upload = document.getElementById('project-upload');
        if (openButton && upload) {
            openButton.onclick = () => upload.click();
            upload.onchange = async () => {
                const file = upload.files?.[0];
                if (!file) return;
                try {
                    await ProjectService.importProject(file);
                    HistoryManager.stack = [];
                    HistoryManager.index = -1;
                    HistoryManager.save();
                    CanvasEngine.draw();
                    this.zoomToFit();
                } catch (error) {
                    alert(error.message || '디자인 파일을 열 수 없습니다.');
                } finally {
                    upload.value = '';
                }
            };
        }

        const saveProject = document.getElementById('btn-save-project');
        if (saveProject) saveProject.onclick = () => ProjectService.downloadProject(title());
        const projectTitle = document.getElementById('project-title');
        if (projectTitle) projectTitle.addEventListener('input', () => ProjectService.saveDraft());
    },

    bindZoomControls: function () {
        const applyZoom = (z) => {
            AppState.zoom = Math.max(0.15, Math.min(z, 5));
            const wrapper = document.getElementById('canvas-wrapper');
            // CSS zoom participates in layout, unlike transform: scale().
            // That keeps every page in the continuous stack inside the
            // scrollable area and makes page 1 reachable again.
            if (wrapper) {
                wrapper.style.zoom = String(AppState.zoom);
                wrapper.style.transform = 'none';
            }
            const zl = document.getElementById('zoom-level');
            if (zl) zl.innerText = Math.round(AppState.zoom * 100) + '%';
            this.syncCanvasOverlayScale();
        };

        const zoomIn = document.getElementById('btn-zoom-in');
        if (zoomIn) zoomIn.onclick = () => applyZoom(AppState.zoom + 0.1);

        const zoomOut = document.getElementById('btn-zoom-out');
        if (zoomOut) zoomOut.onclick = () => applyZoom(AppState.zoom - 0.1);

        const zoomFit = document.getElementById('btn-zoom-fit');
        if (zoomFit) zoomFit.onclick = () => this.zoomToFit();

        // The editor's save action is the authenticated My Work save.
        const dbSave = document.getElementById('btn-db-save');
        if (dbSave) {
            dbSave.onclick = async () => {
                const title = document.getElementById('project-title')?.value || '무제';
                const original = dbSave.innerHTML;
                dbSave.innerHTML = '<i class="ph ph-spinner animate-spin"></i> 저장 중...';
                dbSave.disabled = true;
                const result = await ProjectService.saveToDB(title);
                dbSave.innerHTML = original;
                dbSave.disabled = false;
                if (result?.success) alert('내 작업에 저장되었습니다.');
                else alert(result?.message || '저장하지 못했습니다.');
            };
        }

        // Page buttons in header
        const btnSave = document.getElementById('btn-save');
        if (btnSave) {
            btnSave.onclick = () => {
                const title = document.getElementById('project-title')?.value || '무제';
                ProjectService.downloadPNG(title);
            };
        }

        // Export format dropdown connections
        const btnSavePng = document.getElementById('btn-save-png');
        if (btnSavePng) btnSavePng.onclick = () => ProjectService.downloadPNG(document.getElementById('project-title')?.value);
        const btnSaveJpg = document.getElementById('btn-save-jpg');
        if (btnSaveJpg) btnSaveJpg.onclick = () => ProjectService.downloadJPG(document.getElementById('project-title')?.value);
        const btnSavePdf = document.getElementById('btn-save-pdf');
        if (btnSavePdf) btnSavePdf.onclick = () => ProjectService.downloadPDF(document.getElementById('project-title')?.value);
        const btnSavePptx = document.getElementById('btn-save-pptx');
        if (btnSavePptx) btnSavePptx.onclick = () => ProjectService.downloadPPTX(document.getElementById('project-title')?.value);
    },

    zoomToFit: function () {
        const container = document.getElementById('canvas-scroll-area');
        const cv = CanvasEngine.canvas;
        if (!container || !cv) return;
        // Keep a portion of the next page in view on normal desktop screens.
        // On taller/wider screens this naturally exposes more of the continuous stack.
        const continuousHeight = AppState.pages.length > 1 ? CanvasEngine.getPageHeight() * 1.42 + 34 : CanvasEngine.getPageHeight();
        const fitScale = Math.min((container.clientWidth - 80) / CanvasEngine.getPageWidth(), (container.clientHeight - 80) / continuousHeight, 1.2);
        AppState.zoom = fitScale;
        const wrapper = document.getElementById('canvas-wrapper');
        if (wrapper) {
            wrapper.style.zoom = String(AppState.zoom);
            wrapper.style.transform = 'none';
        }
        container.classList.toggle('is-continuous-stack', AppState.pages.length > 1);
        const zl = document.getElementById('zoom-level');
        if (zl) zl.innerText = Math.round(AppState.zoom * 100) + '%';
        this.syncCanvasOverlayScale();
    },

    // The page actions live beside the canvas, but must remain finger/cursor
    // sized even when the canvas itself is zoomed in or out.
    syncCanvasOverlayScale: function () {
        const toolbar = document.querySelector('.page-side-toolbar');
        const canvas = CanvasEngine.canvas;
        const workspace = document.getElementById('canvas-scroll-area');
        if (!toolbar || !canvas || !workspace) return;
        const isMobile = window.matchMedia('(max-width: 900px)').matches;
        const canvasRect = canvas.getBoundingClientRect();
        const workspaceRect = workspace.getBoundingClientRect();
        const toolbarWidth = toolbar.offsetWidth || (isMobile ? 260 : 36);
        const toolbarHeight = toolbar.offsetHeight || 300;

        toolbar.style.transform = 'none';
        if (isMobile) {
            toolbar.style.left = `${Math.max(8, Math.min(canvasRect.left, window.innerWidth - toolbarWidth - 8))}px`;
            toolbar.style.top = `${Math.max(workspaceRect.top + 8, canvasRect.top - toolbarHeight - 10)}px`;
        } else {
            const preferredLeft = canvasRect.right + 18;
            toolbar.style.left = `${Math.max(workspaceRect.left + 8, Math.min(preferredLeft, workspaceRect.right - toolbarWidth - 8))}px`;
            toolbar.style.top = `${Math.max(workspaceRect.top + 8, Math.min(canvasRect.top + 8, workspaceRect.bottom - toolbarHeight - 8))}px`;
        }
    },

    refreshPageNavigationStatus: function () {
        const total = AppState.pages?.length || 0;
        const current = total ? AppState.currentIdx + 1 : 0;
        const status = document.getElementById('page-current-status');
        const previous = document.getElementById('page-prev');
        const next = document.getElementById('page-next');
        if (status) {
            status.innerHTML = `${current} / ${total}<small>편집 중</small>`;
            status.setAttribute('aria-label', `현재 편집 페이지 ${current}, 전체 ${total}페이지`);
        }
        if (previous) previous.disabled = AppState.currentIdx <= 0;
        if (next) next.disabled = AppState.currentIdx >= total - 1;
    },

    bindTemplateStudio: function () {
        const enabled = new URLSearchParams(location.search).get('templateMode') === '1';
        if (!enabled || document.body.dataset.role !== 'admin') return;
        const button = document.getElementById('btn-template-register');
        const assetButton = document.getElementById('btn-asset-register');
        const controls = document.getElementById('template-slot-controls');
        button?.classList.remove('hidden');
        assetButton?.classList.remove('hidden');
        controls?.classList.remove('hidden');
        if (!button) return;

        button.onclick = async () => {
            const title = prompt('템플릿 이름', document.getElementById('project-title')?.value || '새 템플릿');
            if (!title?.trim()) return;
            const category = prompt('템플릿 분류', '카드뉴스') || '카드뉴스';
            const tags = (prompt('해시태그 (쉼표로 구분)', '정책, 홍보') || '').split(',').map(tag => tag.replace(/^#/, '').trim()).filter(Boolean);
            const description = prompt('설명(선택)', '') || '';
            const original = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="ph ph-spinner animate-spin"></i> 등록 중...';
            try {
                const designState = ProjectService.projectPayload();
                const slots = Object.entries(AppState.getEls()).map(([id, el]) => ({
                    elementId: id, role: el.templateRole || 'general', type: el.type,
                    locked: Boolean(el.locked), editable: !el.locked
                }));
                CanvasEngine.draw(true);
                const previewData = CanvasEngine.canvas.toDataURL('image/jpeg', 0.72);
                CanvasEngine.draw();
                const response = await fetch('/api/admin/templates', {
                    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, category, tags, description, design_state: designState, slot_config: slots, preview_data: previewData })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.message || '템플릿을 등록하지 못했습니다.');
                alert('템플릿이 등록되었습니다. 관리자 화면에서 공개 상태를 관리할 수 있습니다.');
            } catch (error) {
                alert(error.message || '템플릿을 등록하지 못했습니다.');
            } finally {
                button.disabled = false;
                button.innerHTML = original;
            }
        };

        assetButton?.addEventListener('click', async () => {
            if (AppState.selectedIds.length !== 1) return alert('클립아트로 등록할 요소를 하나만 선택해 주세요.');
            const selected = AppState.getEls()[AppState.selectedIds[0]];
            if (!selected) return;
            const title = prompt('개별 요소 이름', selected.type === 'text' ? (selected.text || '텍스트 요소').slice(0, 40) : `${selected.type} 요소`);
            if (!title?.trim()) return;
            const category = prompt('요소 분류', '클립아트') || '클립아트';
            const tags = (prompt('해시태그 (쉼표로 구분)', '') || '').split(',').map(tag => tag.replace(/^#/, '').trim()).filter(Boolean);
            const elementData = JSON.parse(JSON.stringify(selected, (key, value) => (key === 'img' || key.startsWith('_') ? undefined : value)));
            const original = assetButton.innerHTML;
            assetButton.disabled = true; assetButton.innerHTML = '<i class="ph ph-spinner animate-spin"></i> 등록 중…';
            try {
                CanvasEngine.draw(true);
                const previewData = CanvasEngine.canvas.toDataURL('image/jpeg', 0.72);
                CanvasEngine.draw();
                const response = await fetch('/api/admin/assets', {
                    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, asset_type: 'clipart', category, tags, element_data: elementData, preview_data: previewData })
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.message || '요소를 등록하지 못했습니다.');
                alert('개별 요소 라이브러리에 등록했습니다.');
            } catch (error) { alert(error.message || '요소를 등록하지 못했습니다.'); }
            finally { assetButton.disabled = false; assetButton.innerHTML = original; }
        });
    },

    bindRightPanelControls: function () {
        const updateProp = (propName, val, isNumeric = false) => {
            const els = AppState.getEls();
            AppState.selectedIds.forEach(id => {
                if (els[id]) {
                    els[id][propName] = isNumeric ? Number(val) : val;
                }
            });
            HistoryManager.save();
            CanvasEngine.draw();
        };

        const propColor = document.getElementById('prop-color');
        if (propColor) {
            propColor.oninput = (e) => updateProp('color', e.target.value);
        }

        const propSize = document.getElementById('adv-size');
        if (propSize) {
            propSize.oninput = (e) => updateProp('size', e.target.value, true);
        }

        const propRot = document.getElementById('prop-rotation');
        if (propRot) {
            propRot.oninput = (e) => updateProp('rot', e.target.value, true);
        }

        const applyAll = (property, value) => {
            AppState.getSelectedEls().forEach(el => { el[property] = value; });
            HistoryManager.save(); CanvasEngine.draw();
        };
        const bindEffect = (id, property, convert = value => value) => {
            const input = document.getElementById(id); if (!input) return;
            const handler = event => applyAll(property, convert(event.target.type === 'checkbox' ? event.target.checked : event.target.value));
            input.oninput = handler; input.onchange = handler;
        };
        bindEffect('chk-element-shadow', 'useShadow');
        bindEffect('prop-shadow-x', 'shadowOffsetX', Number);
        bindEffect('prop-shadow-y', 'shadowOffsetY', Number);
        bindEffect('prop-shadow-blur', 'shadowBlur', Number);
        bindEffect('prop-shadow-color', 'shadowColor');
        bindEffect('prop-shadow-opacity', 'shadowOpacity', value => Number(value) / 100);
        bindEffect('prop-opacity', 'opacity', value => Number(value) / 100);
        document.getElementById('btn-element-shadow-reset')?.addEventListener('click', () => { applyAll('useShadow', false); this.updatePanels(); });

        const selectedImage = () => AppState.getSelectedEls().find(el => el?.type === 'image');
        const updateImage = (property, value) => {
            const image = selectedImage();
            if (!image) return;
            image[property] = value;
            HistoryManager.save();
            CanvasEngine.draw();
        };
        const bindImageRange = (id, property, formatter = value => value) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.oninput = event => updateImage(property, formatter(event.target.value));
        };
        bindImageRange('image-crop-scale', 'cropScale', value => Number(value) / 100);
        bindImageRange('image-crop-x', 'cropOffsetX', Number);
        bindImageRange('image-crop-y', 'cropOffsetY', Number);
        bindImageRange('image-brightness', 'imageBrightness', Number);
        bindImageRange('image-contrast', 'imageContrast', Number);
        bindImageRange('image-saturation', 'imageSaturation', Number);
        bindImageRange('image-blur', 'imageBlur', Number);
        bindImageRange('image-hue', 'imageHue', Number);
        bindImageRange('image-tint-opacity', 'imageTintOpacity', Number);
        [['image-border-color', 'imageBorderColor'], ['image-background-color', 'imageBackgroundColor'], ['image-tint-color', 'imageTintColor']].forEach(([id, property]) => {
            const input = document.getElementById(id); if (input) input.oninput = event => updateImage(property, event.target.value);
        });
        bindImageRange('image-border-width', 'imageBorderWidth', Number);
        [['image-grayscale', 'imageGrayscale'], ['image-invert', 'imageInvert'], ['image-link-enabled', 'linkEnabled']].forEach(([id, property]) => {
            const input = document.getElementById(id); if (input) input.onchange = event => updateImage(property, event.target.checked);
        });
        document.getElementById('image-link-url')?.addEventListener('input', event => updateImage('linkUrl', event.target.value.trim()));
        document.getElementById('btn-image-flip-x')?.addEventListener('click', () => { const image = selectedImage(); if (image) updateImage('flipX', !image.flipX); });
        document.getElementById('btn-image-flip-y')?.addEventListener('click', () => { const image = selectedImage(); if (image) updateImage('flipY', !image.flipY); });
        const resetImage = () => {
            const image = selectedImage(); if (!image) return;
            ['cropScale', 'cropOffsetX', 'cropOffsetY', 'imageBrightness', 'imageContrast', 'imageSaturation', 'imageBlur', 'imageHue', 'imageGrayscale', 'imageInvert', 'flipX', 'flipY'].forEach(property => delete image[property]);
            HistoryManager.save(); CanvasEngine.draw(); this.updatePanels();
        };
        document.getElementById('btn-image-reset')?.addEventListener('click', resetImage);
        document.getElementById('btn-image-crop-reset')?.addEventListener('click', () => {
            const image = selectedImage(); if (!image) return;
            ['cropScale', 'cropOffsetX', 'cropOffsetY'].forEach(property => delete image[property]);
            HistoryManager.save(); CanvasEngine.draw(); this.updatePanels();
        });
        const imageUpload = document.getElementById('image-replace-upload');
        document.getElementById('btn-image-replace')?.addEventListener('click', () => imageUpload?.click());
        if (imageUpload) imageUpload.onchange = event => {
            const file = event.target.files?.[0]; const image = selectedImage();
            if (!file || !image || !file.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = () => { image.imgSrc = reader.result; delete image.img; HistoryManager.save(); CanvasEngine.draw(); };
            reader.readAsDataURL(file); event.target.value = '';
        };
        document.getElementById('btn-image-background')?.addEventListener('click', () => {
            const image = selectedImage(); const page = AppState.getPage(); if (!image?.imgSrc || !page) return;
            page.bgType = 'image'; page.bgImageSrc = image.imgSrc; page.bgSourceElementId = image._id; image.hidden = true; delete page._bgImage;
            HistoryManager.save(); CanvasEngine.draw();
        });

        const templateRole = document.getElementById('template-role');
        if (templateRole) templateRole.onchange = (e) => updateProp('templateRole', e.target.value || null);
        const templateLocked = document.getElementById('template-locked');
        if (templateLocked) templateLocked.onchange = (e) => updateProp('locked', e.target.checked);

        // Shape styling and stroke controls
        const shapeStrokeColor = document.getElementById('prop-shape-stroke-color');
        if (shapeStrokeColor) {
            shapeStrokeColor.oninput = (e) => updateProp('strokeColor', e.target.value);
        }

        const shapeStrokeWidth = document.getElementById('prop-shape-stroke-width');
        if (shapeStrokeWidth) {
            shapeStrokeWidth.oninput = (e) => updateProp('strokeWidth', e.target.value, true);
        }

        const shapeBorderRadius = document.getElementById('prop-shape-border-radius');
        if (shapeBorderRadius) {
            shapeBorderRadius.oninput = (e) => updateProp('borderRadius', e.target.value, true);
        }

        const shapeOpacity = document.getElementById('prop-shape-opacity');
        if (shapeOpacity) {
            shapeOpacity.oninput = (e) => updateProp('opacity', e.target.value, true);
        }

        // Shape fills keep their own data so a gradient survives saving, reuse,
        // and template registration just like a normal colour fill.
        const shapeFillType = document.getElementById('shape-fill-type');
        const shapeGradientControls = document.getElementById('shape-gradient-controls');
        const shapeGradientType = document.getElementById('shape-gradient-type');
        const shapeGradientAngleWrap = document.getElementById('shape-gradient-angle-wrap');
        const syncShapeGradientUI = () => {
            const enabled = shapeFillType?.value === 'gradient';
            if (shapeGradientControls) shapeGradientControls.classList.toggle('hidden', !enabled);
            if (shapeGradientAngleWrap) shapeGradientAngleWrap.classList.toggle('hidden', shapeGradientType?.value === 'radial');
        };
        if (shapeFillType) shapeFillType.onchange = event => { updateProp('fillType', event.target.value); syncShapeGradientUI(); };
        const bindShapeGradient = (id, property, numeric = false, valueLabelId = '') => {
            const input = document.getElementById(id);
            if (!input) return;
            input.oninput = event => {
                const value = numeric ? Number(event.target.value) : event.target.value;
                updateProp(property, value);
                if (valueLabelId) { const label = document.getElementById(valueLabelId); if (label) label.textContent = value; }
            };
            if (id === 'shape-gradient-type') input.onchange = event => { updateProp(property, event.target.value); syncShapeGradientUI(); };
        };
        bindShapeGradient('shape-gradient-color-1', 'gradientColor1');
        bindShapeGradient('shape-gradient-color-2', 'gradientColor2');
        bindShapeGradient('shape-gradient-type', 'gradientType');
        bindShapeGradient('shape-gradient-angle', 'gradientAngle', true, 'shape-gradient-angle-value');

        const shapeStrokeFillType = document.getElementById('shape-stroke-fill-type');
        const shapeStrokeGradientOptions = document.getElementById('shape-stroke-gradient-options');
        const shapeStrokeGradientType = document.getElementById('shape-stroke-gradient-type');
        const shapeStrokeGradientAngleWrap = document.getElementById('shape-stroke-gradient-angle-wrap');
        const syncShapeStrokeGradientUI = () => {
            const enabled = shapeStrokeFillType?.value === 'gradient';
            if (shapeStrokeGradientOptions) shapeStrokeGradientOptions.classList.toggle('hidden', !enabled);
            if (shapeStrokeGradientAngleWrap) shapeStrokeGradientAngleWrap.classList.toggle('hidden', shapeStrokeGradientType?.value === 'radial');
        };
        if (shapeStrokeFillType) shapeStrokeFillType.onchange = event => { updateProp('strokeFillType', event.target.value); syncShapeStrokeGradientUI(); };
        const bindShapeStrokeGradient = (id, property, numeric = false, valueLabelId = '') => {
            const input = document.getElementById(id);
            if (!input) return;
            input.oninput = event => {
                const value = numeric ? Number(event.target.value) : event.target.value;
                updateProp(property, value);
                if (valueLabelId) { const label = document.getElementById(valueLabelId); if (label) label.textContent = value; }
            };
            if (id === 'shape-stroke-gradient-type') input.onchange = event => { updateProp(property, event.target.value); syncShapeStrokeGradientUI(); };
        };
        bindShapeStrokeGradient('shape-stroke-gradient-color-1', 'strokeGradientColor1');
        bindShapeStrokeGradient('shape-stroke-gradient-color-2', 'strokeGradientColor2');
        bindShapeStrokeGradient('shape-stroke-gradient-type', 'strokeGradientType');
        bindShapeStrokeGradient('shape-stroke-gradient-angle', 'strokeGradientAngle', true, 'shape-stroke-gradient-angle-value');

        // Style bindings (B, I, U, spacing, scaleX)
        const bindStyle = (id, propName, isCheckbox = false, isDiv = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.oninput = (e) => {
                let val = isCheckbox ? e.target.checked : e.target.value;
                if (id === 'adv-scale') val = Number(val) / 100;
                updateProp(propName, val, !isCheckbox);
            };
        };

        bindStyle('adv-spacing', 'spacing');
        bindStyle('adv-lineheight', 'lineHeight');
        bindStyle('adv-scale', 'scaleX');

        // Font Family Selector
        const fontFam = document.getElementById('prop-font-family');
        if (fontFam) {
            fontFam.onchange = (e) => updateProp('font', e.target.value);
        }

        // Align buttons
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateProp('align', btn.dataset.align);
            };
        });

        // Bold, Italic, Underline button toggles
        const bindToggleBtn = (btnId, propName) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.onclick = () => {
                    const els = AppState.getEls();
                    AppState.selectedIds.forEach(id => {
                        if (els[id]) {
                            els[id][propName] = !els[id][propName];
                        }
                    });
                    HistoryManager.save();
                    CanvasEngine.draw();
                };
            }
        };

        bindToggleBtn('adv-bold', 'bold');
        bindToggleBtn('adv-italic', 'italic');
        bindToggleBtn('adv-underline', 'underline');

        // Effects checkboxes
        const bindCheckboxEffect = (chkId, flagName, colorId, valId, defaultColor = '#000000', defaultVal = 3) => {
            const chk = document.getElementById(chkId);
            if (!chk) return;
            chk.onchange = (e) => {
                const els = AppState.getEls();
                AppState.selectedIds.forEach(id => {
                    const el = els[id];
                    if (el && el.type === 'text') {
                        el[flagName] = e.target.checked;
                        
                        // Automatically set initial inputs values
                        const colorEl = document.getElementById(colorId);
                        if (colorEl && !el[colorId.replace('color-', 'bgColor').replace('color-', 'outlineColor')]) {
                            el[colorId.replace('color-', 'bgColor').replace('color-', 'outlineColor')] = colorEl.value || defaultColor;
                        }
                        const valEl = document.getElementById(valId);
                        if (valEl) {
                            el[valId.replace('val-', 'outlineWidth')] = Number(valEl.value) || defaultVal;
                        }
                    }
                });
                HistoryManager.save();
                CanvasEngine.draw();
            };
        };

        bindCheckboxEffect('chk-bg', 'useBg', 'color-bg', 'chk-bg'); // bg has no value numeric
        bindCheckboxEffect('chk-outline', 'useOutline', 'color-outline', 'val-outline');
        bindCheckboxEffect('chk-double', 'useDoubleOutline', 'color-double', 'val-double');
        bindCheckboxEffect('chk-shadow', 'useShadow', 'color-shadow', 'chk-shadow');

        // Colors inside effects
        const bindColorEffect = (colorId, propName) => {
            const el = document.getElementById(colorId);
            if (el) {
                el.oninput = (e) => updateProp(propName, e.target.value);
            }
        };
        bindColorEffect('color-bg', 'bgColor');
        bindColorEffect('color-outline', 'outlineColor');
        bindColorEffect('color-double', 'doubleColor');
        bindColorEffect('color-shadow', 'shadowColor');

        // Outline numbers inside effects
        const bindOutlineNum = (valId, propName) => {
            const el = document.getElementById(valId);
            if (el) {
                el.oninput = (e) => updateProp(propName, e.target.value, true);
            }
        };
        bindOutlineNum('val-outline', 'outlineWidth');
        bindOutlineNum('val-double', 'doubleWidth');
        
        // Page background styling
        const bgSolidBtn = document.getElementById('bg-type-solid');
        if (bgSolidBtn) {
            bgSolidBtn.onclick = () => {
                AppState.getPage().bgType = 'solid';
                HistoryManager.save();
                CanvasEngine.draw();
            };
        }
        const bgGradBtn = document.getElementById('bg-type-gradient');
        if (bgGradBtn) {
            bgGradBtn.onclick = () => {
                AppState.getPage().bgType = 'gradient';
                HistoryManager.save();
                CanvasEngine.draw();
            };
        }
        const bgUpload = document.getElementById('page-bg-upload');
        if (bgUpload) {
            bgUpload.onchange = (event) => {
                const file = event.target.files?.[0];
                if (!file || !file.type.startsWith('image/')) return;
                const reader = new FileReader();
                reader.onload = () => {
                    const page = AppState.getPage();
                    page.bgType = 'image';
                    page.bgImageSrc = reader.result;
                    delete page._bgImage;
                    HistoryManager.save();
                    CanvasEngine.draw();
                };
                reader.readAsDataURL(file);
                event.target.value = '';
            };
        }
        const clearPageBackground = (returnSource = false) => {
            const page = AppState.getPage();
            if (!page) return;
            // An image promoted to a page background is deliberately hidden.
            // Clearing that background must never leave the original image lost.
            const source = page.bgSourceElementId ? page.els?.[page.bgSourceElementId] : null;
            if (source) {
                source.hidden = false;
                if (returnSource) AppState.selectedIds = [page.bgSourceElementId];
            }
            page.bgType = 'solid';
            delete page.bgImageSrc;
            delete page.bgSourceElementId;
            delete page._bgImage;
            HistoryManager.save();
            CanvasEngine.draw();
        };
        document.getElementById('btn-page-bg-clear')?.addEventListener('click', () => clearPageBackground(false));
        document.getElementById('btn-page-bg-return-source')?.addEventListener('click', () => clearPageBackground(true));
        document.getElementById('btn-page-bg-copy')?.addEventListener('click', () => {
            const page = AppState.getPage();
            if (!page) return;
            this.pageBackgroundClipboard = {
                bgType: page.bgType, bgColor: page.bgColor, bgColor2: page.bgColor2,
                bgGradientAngle: page.bgGradientAngle, bgImageSrc: page.bgImageSrc
            };
        });
        document.getElementById('btn-page-bg-paste')?.addEventListener('click', () => {
            const page = AppState.getPage(); const source = this.pageBackgroundClipboard;
            if (!page || !source) return;
            Object.assign(page, JSON.parse(JSON.stringify(source)));
            delete page.bgSourceElementId; delete page._bgImage;
            HistoryManager.save(); CanvasEngine.draw();
        });
        const bgPrimaryColor = document.getElementById('page-bg-color1');
        if (bgPrimaryColor) {
            bgPrimaryColor.oninput = (e) => {
                AppState.getPage().bgColor = e.target.value;
                HistoryManager.save();
                CanvasEngine.draw();
            };
        }
        const bgSecondaryColor = document.getElementById('page-bg-color2');
        if (bgSecondaryColor) {
            bgSecondaryColor.oninput = (e) => {
                AppState.getPage().bgColor2 = e.target.value;
                HistoryManager.save();
                CanvasEngine.draw();
            };
        }
        const workspaceColor = document.getElementById('workspace-bg-color');
        const workspace = document.getElementById('canvas-scroll-area');
        const savedWorkspaceColor = localStorage.getItem('pollinsight-workspace-color') || '#f1f5f9';
        if (workspace) workspace.style.backgroundColor = savedWorkspaceColor;
        if (workspaceColor) {
            workspaceColor.value = savedWorkspaceColor;
            workspaceColor.oninput = event => {
                if (workspace) workspace.style.backgroundColor = event.target.value;
                localStorage.setItem('pollinsight-workspace-color', event.target.value);
            };
        }

        const bgStrokeColor = document.getElementById('page-bg-stroke-color');
        if (bgStrokeColor) {
            bgStrokeColor.oninput = (e) => {
                AppState.getPage().bgStrokeColor = e.target.value;
                HistoryManager.save();
                CanvasEngine.draw();
            };
        }

        const bgStrokeWidth = document.getElementById('page-bg-stroke-width');
        if (bgStrokeWidth) {
            bgStrokeWidth.oninput = (e) => {
                AppState.getPage().bgStrokeWidth = Number(e.target.value);
                HistoryManager.save();
                CanvasEngine.draw();
            };
        }
    },

    bindTableControls: function () {
        const tablePanel = document.getElementById('adv-table-controls');
        if (tablePanel && !document.getElementById('table-cell-text-controls')) {
            tablePanel.insertAdjacentHTML('afterbegin', `
                <div id="table-cell-text-controls" class="space-y-2 rounded-lg border border-blue-900/60 bg-slate-950/50 p-3">
                    <div class="flex items-center justify-between"><h5 class="text-xs font-bold text-blue-200">선택 셀 텍스트</h5><span id="table-selection-label" class="text-[10px] text-slate-500">셀을 클릭하거나 드래그</span></div>
                    <select id="table-cell-font" class="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-slate-100"><option value="Pretendard">Pretendard</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Georgia">Georgia</option></select>
                    <div class="grid grid-cols-2 gap-2"><label class="text-[10px] text-slate-400">글자 크기<input id="table-cell-size" type="number" min="8" max="200" value="14" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-center text-xs"></label><label class="text-[10px] text-slate-400">글자 색상<input id="table-cell-text-color" type="color" value="#1e293b" class="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900"></label></div>
                    <div class="grid grid-cols-3 gap-1"><button id="table-cell-bold" type="button" class="rounded border border-slate-700 py-1.5 text-xs font-bold">B</button><button id="table-cell-italic" type="button" class="rounded border border-slate-700 py-1.5 text-xs italic">I</button><button id="table-cell-underline" type="button" class="rounded border border-slate-700 py-1.5 text-xs underline">U</button></div>
                    <div class="grid grid-cols-3 gap-1"><button type="button" class="table-cell-align rounded border border-slate-700 py-1 text-xs" data-align="left">왼쪽</button><button type="button" class="table-cell-align rounded border border-slate-700 py-1 text-xs" data-align="center">가운데</button><button type="button" class="table-cell-align rounded border border-slate-700 py-1 text-xs" data-align="right">오른쪽</button></div>
                </div>`);
            const tableFontControl = document.getElementById('table-cell-font');
            this.fontCatalog?.forEach(item => { if (![...tableFontControl.options].some(option => option.value === item.family)) tableFontControl.add(new Option(item.label, item.family)); });
            const selectedCells = () => {
                const table = AppState.getSelectedEls()[0]; const selection = AppState.tableSelection || AppState.editingCell;
                if (!table || table.type !== 'table' || !selection || selection.id !== table._id) return [];
                const anchor = selection.anchor || selection, focus = selection.focus || selection;
                const cells=[]; for(let r=Math.min(anchor.r,focus.r); r<=Math.max(anchor.r,focus.r); r++) for(let c=Math.min(anchor.c,focus.c); c<=Math.max(anchor.c,focus.c); c++) cells.push(table.cells[r][c]); return cells;
            };
            const apply = (property, value) => { const cells=selectedCells(); if(!cells.length) return; cells.forEach(cell => { cell[property]=value; }); HistoryManager.save(); CanvasEngine.draw(); };
            [['table-cell-font','font'],['table-cell-size','size',Number],['table-cell-text-color','color']].forEach(([id,property,convert])=>{const input=document.getElementById(id);input.oninput=event=>apply(property,convert?convert(event.target.value):event.target.value);input.onchange=input.oninput;});
            [['table-cell-bold','bold'],['table-cell-italic','italic'],['table-cell-underline','underline']].forEach(([id,property])=>document.getElementById(id).onclick=()=>{const cells=selectedCells();if(!cells.length)return;apply(property,!cells[0][property]);});
            document.querySelectorAll('.table-cell-align').forEach(button=>button.onclick=()=>apply('align',button.dataset.align));
        }
        const addTableBtn = document.getElementById('add-table');
        if (addTableBtn) {
            addTableBtn.onclick = () => {
                const cv = CanvasEngine.canvas;
                const id = 'table_' + Math.random().toString(36).substring(2, 9);
                const defaultCells = [
                    [{ text: '헤더 1', bold: true, align: 'center', bgColor: '#f1f5f9' }, { text: '헤더 2', bold: true, align: 'center', bgColor: '#f1f5f9' }, { text: '헤더 3', bold: true, align: 'center', bgColor: '#f1f5f9' }],
                    [{ text: '데이터 A1' }, { text: '데이터 A2' }, { text: '데이터 A3' }],
                    [{ text: '데이터 B1' }, { text: '데이터 B2' }, { text: '데이터 B3' }]
                ];

                AppState.getEls()[id] = {
                    type: 'table',
                    x: CanvasEngine.getPageWidth() / 2 - 250,
                    y: CanvasEngine.getPageHeight() / 2 - 100,
                    w: 500,
                    h: 200,
                    rows: 3,
                    cols: 3,
                    colWidths: [166.67, 166.67, 166.66],
                    rowHeights: [66.67, 66.67, 66.66],
                    cells: defaultCells,
                    borderColor: '#cbd5e1',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    dashLength: 8,
                    dashGap: 5,
                    rot: 0,
                    opacity: 1
                };
                AppState.selectedIds = [id];
                AppState.editingCell = { id, r: 0, c: 0 };
                HistoryManager.save();
                CanvasEngine.draw();
            };
        }

        // Table manipulations
        const addRowBtn = document.getElementById('table-add-row');
        if (addRowBtn) {
            addRowBtn.onclick = () => {
                const selected = AppState.getSelectedEls()[0];
                if (selected && selected.type === 'table') {
                    selected.rows = (selected.rows || 0) + 1;
                    const newRow = [];
                    for (let c = 0; c < selected.cols; c++) {
                        newRow.push({ text: '' });
                    }
                    selected.cells.push(newRow);
                    const { rowHeights } = CanvasEngine.getTableMetrics(selected);
                    selected.rowHeights = rowHeights.map(size => size * ((selected.rows - 1) / selected.rows));
                    selected.rowHeights.push(selected.h / selected.rows);
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        const delRowBtn = document.getElementById('table-del-row');
        if (delRowBtn) {
            delRowBtn.onclick = () => {
                const selected = AppState.getSelectedEls()[0];
                if (selected && selected.type === 'table' && selected.rows > 1) {
                    selected.rows -= 1;
                    selected.cells.pop();
                    selected.rowHeights?.pop();
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        const addColBtn = document.getElementById('table-add-col');
        if (addColBtn) {
            addColBtn.onclick = () => {
                const selected = AppState.getSelectedEls()[0];
                if (selected && selected.type === 'table') {
                    selected.cols = (selected.cols || 0) + 1;
                    selected.cells.forEach(row => {
                        row.push({ text: '' });
                    });
                    const { colWidths } = CanvasEngine.getTableMetrics(selected);
                    selected.colWidths = colWidths.map(size => size * ((selected.cols - 1) / selected.cols));
                    selected.colWidths.push(selected.w / selected.cols);
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        const delColBtn = document.getElementById('table-del-col');
        if (delColBtn) {
            delColBtn.onclick = () => {
                const selected = AppState.getSelectedEls()[0];
                if (selected && selected.type === 'table' && selected.cols > 1) {
                    selected.cols -= 1;
                    selected.cells.forEach(row => {
                        row.pop();
                    });
                    selected.colWidths?.pop();
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        const cellColor = document.getElementById('table-cell-color');
        if (cellColor) {
            cellColor.oninput = (e) => {
                const el = AppState.getSelectedEls()[0];
                const selection = AppState.tableSelection || AppState.editingCell;
                if (el?.type === 'table' && selection?.id === el._id) {
                    const anchor = selection.anchor || selection, focus = selection.focus || selection;
                    for (let r = Math.min(anchor.r, focus.r); r <= Math.max(anchor.r, focus.r); r++) for (let c = Math.min(anchor.c, focus.c); c <= Math.max(anchor.c, focus.c); c++) el.cells[r][c].bgColor = e.target.value;
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        const cellText = document.getElementById('table-cell-text');
        if (cellText) {
            cellText.oninput = (e) => {
                const el = AppState.getSelectedEls()[0];
                const cellInfo = AppState.editingCell;
                if (el?.type === 'table' && cellInfo && cellInfo.id === el._id) {
                    if (!el.cells[cellInfo.r]) el.cells[cellInfo.r] = [];
                    if (!el.cells[cellInfo.r][cellInfo.c]) el.cells[cellInfo.r][cellInfo.c] = { text: '' };
                    el.cells[cellInfo.r][cellInfo.c].text = e.target.value;
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        const borderInputs = ['table-border-style', 'table-border-color', 'table-border-width', 'table-dash-length', 'table-dash-gap'];
        const borderStyleControl = document.getElementById('table-border-style');
        if (borderStyleControl && !document.getElementById('table-border-target')) {
            borderStyleControl.closest('.space-y-2')?.insertAdjacentHTML('afterbegin', `
                <label class="block text-xs text-slate-400">테두리 적용 대상
                    <select id="table-border-target" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-2 text-slate-100">
                        <option value="selected">선택 셀 / 내부선</option>
                        <option value="table">전체 표</option>
                    </select>
                </label>`);
        }
        const applyBorderStyle = () => {
            const selected = AppState.getSelectedEls()[0];
            if (!selected || selected.type !== 'table') return;
            const style = document.getElementById('table-border-style').value;
            const color = document.getElementById('table-border-color').value;
            const width = Math.max(0.5, Number(document.getElementById('table-border-width').value) || 1);
            const dashLength = Math.max(1, Number(document.getElementById('table-dash-length').value) || 8);
            const dashGap = Math.max(1, Number(document.getElementById('table-dash-gap').value) || 5);
            const target = document.getElementById('table-border-target')?.value || 'selected';
            const selection = AppState.tableSelection || AppState.editingCell;
            const isCellSelection = target === 'selected' && selection?.id === selected._id;

            if (isCellSelection) {
                const anchor = selection.anchor || selection;
                const focus = selection.focus || selection;
                for (let r = Math.min(anchor.r, focus.r); r <= Math.max(anchor.r, focus.r); r++) {
                    for (let c = Math.min(anchor.c, focus.c); c <= Math.max(anchor.c, focus.c); c++) {
                        const cell = selected.cells?.[r]?.[c];
                        if (!cell) continue;
                        Object.assign(cell, { borderStyle: style, borderColor: color, borderWidth: width, dashLength, dashGap });
                    }
                }
            } else {
                Object.assign(selected, { borderStyle: style, borderColor: color, borderWidth: width, dashLength, dashGap });
            }
            HistoryManager.save();
            CanvasEngine.draw();
        };
        borderInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.oninput = applyBorderStyle;
        });
        const borderTarget = document.getElementById('table-border-target');
        if (borderTarget) borderTarget.onchange = () => this.updatePanels();
    },

    bindChartControls: function () {
        const addChartWithPreset = (chartType) => {
            const cv = CanvasEngine.canvas;
            const id = 'chart_' + Math.random().toString(36).substring(2, 9);
            AppState.getEls()[id] = {
                type: 'chart',
                chartType: chartType,
                x: cv.width / 2 - 200,
                y: cv.height / 2 - 150,
                w: 400,
                h: 300,
                labels: ['1팀', '2팀', '3팀', '4팀'],
                data: [35, 80, 50, 95],
                colors: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
                rot: 0,
                opacity: 1
            };
            AppState.selectedIds = [id];
            HistoryManager.save();
            CanvasEngine.draw();
        };

        const addBarChart = document.getElementById('add-chart-bar');
        if (addBarChart) addBarChart.onclick = () => addChartWithPreset('bar');
        const addLineChart = document.getElementById('add-chart-line');
        if (addLineChart) addLineChart.onclick = () => addChartWithPreset('line');
        const addPieChart = document.getElementById('add-chart-pie');
        if (addPieChart) addPieChart.onclick = () => addChartWithPreset('pie');
        const addDonutChart = document.getElementById('add-chart-donut');
        if (addDonutChart) addDonutChart.onclick = () => addChartWithPreset('donut');

        // Dynamic Chart Dataset edit bindings
        const chartDataGrid = document.getElementById('chart-data-grid');
        if (chartDataGrid) {
            chartDataGrid.oninput = () => {
                const selected = AppState.getSelectedEls()[0];
                if (selected && selected.type === 'chart') {
                    const rowEls = chartDataGrid.querySelectorAll('.chart-data-row');
                    const newLabels = [];
                    const newData = [];
                    rowEls.forEach(row => {
                        const lbl = row.querySelector('.chart-lbl').value || 'Label';
                        const val = Number(row.querySelector('.chart-val').value) || 0;
                        newLabels.push(lbl);
                        newData.push(val);
                    });
                    selected.labels = newLabels;
                    selected.data = newData;
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        // Add Chart Dataset rows
        const addChartRow = document.getElementById('chart-add-row');
        if (addChartRow) {
            addChartRow.onclick = () => {
                const selected = AppState.getSelectedEls()[0];
                if (selected && selected.type === 'chart') {
                    selected.labels.push('새 항목');
                    selected.data.push(50);
                    HistoryManager.save();
                    this.updatePanels();
                    CanvasEngine.draw();
                }
            };
        }
    },

    bindLineControls: function () {
        const shapePanel = document.getElementById('adv-shape-controls');
        if (!shapePanel || document.getElementById('line-controls')) return;
        shapePanel.insertAdjacentHTML('afterbegin', `
            <div id="line-controls" class="hidden space-y-3 rounded-lg border border-blue-900/60 bg-slate-950/50 p-3">
                <div class="flex items-center justify-between"><h5 class="text-xs font-bold text-blue-200">선 · 화살표</h5><span class="text-[10px] text-slate-500">점 드래그로 꺾기</span></div>
                <div class="grid grid-cols-2 gap-2"><label class="text-[10px] text-slate-400">선 색상<input id="line-color" type="color" class="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-900"></label><label class="text-[10px] text-slate-400">선 두께<input id="line-width" type="number" min="1" max="60" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-center text-xs text-slate-100"></label></div>
                <div class="grid grid-cols-2 gap-2"><label class="text-[10px] text-slate-400">선 모양<select id="line-style" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-slate-100"><option value="solid">실선</option><option value="dashed">점선</option><option value="dotted">점점선</option></select></label><label class="text-[10px] text-slate-400">끝 모양<select id="line-cap" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-slate-100"><option value="butt">평면</option><option value="round">둥근 끝</option><option value="square">사각 끝</option></select></label></div>
                <div class="grid grid-cols-2 gap-2"><label class="text-[10px] text-slate-400">점선 길이<input id="line-dash-length" type="number" min="1" max="80" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-center text-xs text-slate-100"></label><label class="text-[10px] text-slate-400">점선 간격<input id="line-dash-gap" type="number" min="1" max="80" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-center text-xs text-slate-100"></label></div>
                <div class="grid grid-cols-2 gap-2"><label class="text-[10px] text-slate-400">시작점<select id="line-start-cap" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-slate-100"><option value="none">없음</option><option value="arrow">화살촉</option><option value="circle">원</option><option value="square">네모</option><option value="bar">막대</option></select></label><label class="text-[10px] text-slate-400">끝점<select id="line-end-cap" class="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-xs text-slate-100"><option value="none">없음</option><option value="arrow">화살촉</option><option value="circle">원</option><option value="square">네모</option><option value="bar">막대</option></select></label></div>
                <div class="grid grid-cols-2 gap-2"><button id="line-add-bend" type="button" class="rounded border border-blue-700 bg-blue-950/60 py-1.5 text-[11px] font-bold text-blue-200">+ 꺾임점 추가</button><button id="line-remove-bend" type="button" class="rounded border border-slate-700 bg-slate-800 py-1.5 text-[11px] font-bold text-slate-300">마지막 점 삭제</button></div>
            </div>`);
        const selectedLine = () => AppState.getSelectedEls().filter(el => el.type === 'line');
        const update = (property, value, numeric = false) => {
            const lines = selectedLine(); if (!lines.length) return;
            lines.forEach(line => { line[property] = numeric ? Number(value) : value; });
            HistoryManager.save(); CanvasEngine.draw();
        };
        [['line-color', 'color'], ['line-width', 'strokeWidth', true], ['line-style', 'lineStyle'], ['line-cap', 'lineCap'], ['line-dash-length', 'dashLength', true], ['line-dash-gap', 'dashGap', true], ['line-start-cap', 'startCap'], ['line-end-cap', 'endCap']].forEach(([id, property, numeric]) => {
            const input = document.getElementById(id);
            const handler = event => update(property, event.target.value, numeric);
            input.oninput = handler; input.onchange = handler;
        });
        document.getElementById('line-add-bend').onclick = () => {
            selectedLine().forEach(line => {
                const points = line.points || (line.points = [{ x: 0, y: 0 }, { x: line.w || 200, y: line.h || 0 }]);
                let longest = 0, index = 0;
                for (let i = 0; i < points.length - 1; i++) { const distance = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y); if (distance > longest) { longest = distance; index = i; } }
                const a = points[index], b = points[index + 1]; points.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }); HistoryManager.save(); CanvasEngine.draw();
        };
        document.getElementById('line-remove-bend').onclick = () => { selectedLine().forEach(line => { if (line.points?.length > 2) line.points.splice(-2, 1); }); HistoryManager.save(); CanvasEngine.draw(); };
    },

    bindFontPickerLegacy: function () {
        const select = document.getElementById('prop-font-family');
        const inspector = document.getElementById('adv-common-font');
        if (!select || !inspector || document.getElementById('font-picker')) return;

        select.classList.add('hidden');
        const catalog = [
            { family: 'Pretendard', label: 'Pretendard', group: '기본' },
            { family: 'Arial', label: 'Arial', group: '시스템' },
            { family: 'Times New Roman', label: 'Times New Roman', group: '세리프' },
            { family: 'Courier New', label: 'Courier New', group: '고정폭' },
            { family: 'Georgia', label: 'Georgia', group: '세리프' },
            { family: 'Impact', label: 'Impact', group: '강조' }
        ];
        this.fontCatalog = catalog;
        this.fontPickerFilter = 'recent';
        this.fontFavorites = new Set(JSON.parse(localStorage.getItem('pollinsight-font-favorites') || '[]'));
        this.fontRecent = JSON.parse(localStorage.getItem('pollinsight-font-recent') || '["Pretendard","Arial","Times New Roman"]');
        inspector.insertAdjacentHTML('beforeend', `
            <div id="font-picker" class="mt-2 rounded-lg border border-slate-700 bg-slate-950/60 overflow-hidden">
                <div class="p-2 border-b border-slate-800 space-y-2">
                    <div class="relative"><i class="ph-bold ph-magnifying-glass absolute left-2 top-2 text-slate-500 text-xs"></i><input id="font-search" type="search" placeholder="글꼴 검색" class="w-full py-1.5 pl-7 pr-2 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500"></div>
                    <div class="flex gap-1"><button type="button" class="font-filter flex-1 py-1 text-[10px] rounded bg-blue-600 text-white" data-font-filter="recent">최근</button><button type="button" class="font-filter flex-1 py-1 text-[10px] rounded text-slate-400 hover:bg-slate-800" data-font-filter="all">전체</button><button type="button" class="font-filter flex-1 py-1 text-[10px] rounded text-slate-400 hover:bg-slate-800" data-font-filter="favorite">★ 즐겨찾기</button></div>
                </div>
                <div id="font-list" class="max-h-44 overflow-y-auto p-1"></div>
                <div class="border-t border-slate-800 p-2"><label class="block cursor-pointer"><input id="font-upload" type="file" accept=".ttf,.otf,.woff,.woff2" class="hidden"><span class="flex items-center justify-center gap-1.5 rounded border border-violet-700 bg-violet-950/60 px-2 py-1.5 text-[11px] font-bold text-violet-200 hover:bg-violet-900"><i class="ph-bold ph-upload-simple"></i> PC 글꼴 파일 추가</span></label></div>
            </div><p class="mt-1 text-[10px] leading-4 text-slate-500">등록 글꼴은 현재 브라우저 작업 중에 사용할 수 있습니다.</p>`);

        const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
        const render = () => {
            const list = document.getElementById('font-list');
            if (!list) return;
            const query = document.getElementById('font-search')?.value.trim().toLowerCase() || '';
            let fonts = [...this.fontCatalog];
            if (this.fontPickerFilter === 'recent') fonts = fonts.filter(item => this.fontRecent.includes(item.family));
            if (this.fontPickerFilter === 'favorite') fonts = fonts.filter(item => this.fontFavorites.has(item.family));
            if (query) fonts = fonts.filter(item => `${item.label} ${item.group}`.toLowerCase().includes(query));
            if (!fonts.length) { list.innerHTML = '<p class="p-2 text-[11px] text-slate-500">표시할 글꼴이 없습니다.</p>'; return; }
            list.innerHTML = fonts.map(item => `<div class="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-800"><button type="button" class="font-choice min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs text-slate-200" data-family="${escapeHtml(item.family)}" style="font-family:${escapeHtml(item.family)}">${escapeHtml(item.label)} <span class="ml-1 text-[9px] text-slate-500">${escapeHtml(item.group)}</span></button><button type="button" class="font-favorite px-1.5 py-1 text-xs ${this.fontFavorites.has(item.family) ? 'text-amber-300' : 'text-slate-500'}" data-family="${escapeHtml(item.family)}" aria-label="즐겨찾기">★</button></div>`).join('');
            list.querySelectorAll('.font-choice').forEach(button => button.onclick = () => this.applyFontFamily(button.dataset.family));
            list.querySelectorAll('.font-favorite').forEach(button => button.onclick = () => {
                const family = button.dataset.family;
                this.fontFavorites.has(family) ? this.fontFavorites.delete(family) : this.fontFavorites.add(family);
                localStorage.setItem('pollinsight-font-favorites', JSON.stringify([...this.fontFavorites])); render();
            });
        };
        this.renderFontPicker = render;
        this.applyFontFamily = family => {
            const selected = AppState.getSelectedEls().filter(el => el.type === 'text');
            if (!selected.length) return alert('글꼴을 적용할 텍스트를 먼저 선택해 주세요.');
            selected.forEach(el => { el.font = family; });
            if (![...select.options].some(option => option.value === family)) select.add(new Option(family, family));
            select.value = family;
            this.fontRecent = [family, ...this.fontRecent.filter(item => item !== family)].slice(0, 8);
            localStorage.setItem('pollinsight-font-recent', JSON.stringify(this.fontRecent));
            HistoryManager.save(); CanvasEngine.draw(); render();
        };
        document.querySelectorAll('.font-filter').forEach(button => button.onclick = () => {
            this.fontPickerFilter = button.dataset.fontFilter;
            document.querySelectorAll('.font-filter').forEach(item => item.className = `font-filter flex-1 py-1 text-[10px] rounded ${item === button ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`);
            render();
        });
        document.getElementById('font-search').oninput = render;
        document.getElementById('font-upload').onchange = async event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const label = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || '사용자 글꼴';
            const family = `UserFont_${Date.now()}`;
            try {
                const source = `url(${URL.createObjectURL(file)})`;
                const loaded = await new FontFace(family, source).load();
                document.fonts.add(loaded);
                this.fontCatalog.push({ family, label, group: '내 글꼴' });
                select.add(new Option(label, family));
                this.fontPickerFilter = 'all';
                this.applyFontFamily(family);
            } catch (error) { alert('글꼴 파일을 불러오지 못했습니다. TTF, OTF, WOFF 형식을 확인해 주세요.'); }
        };
        select.onchange = event => this.applyFontFamily(event.target.value);
        render();
    },

    bindFontPicker: function () {
        const select = document.getElementById('prop-font-family');
        const inspector = document.getElementById('adv-common-font');
        if (!select || !inspector || document.getElementById('font-picker-v2')) return;

        select.classList.add('hidden');
        this.fontCatalog = [
            { family: 'Pretendard', label: 'Pretendard', group: '고딕체' },
            { family: 'Arial', label: 'Arial', group: '고딕체' },
            { family: 'Times New Roman', label: 'Times New Roman', group: '명조체' },
            { family: 'Georgia', label: 'Georgia', group: '명조체' },
            { family: 'Courier New', label: 'Courier New', group: '고딕체' },
            { family: 'Impact', label: 'Impact', group: '고딕체' }
        ];
        this.fontPickerFilter = 'recent';
        this.fontFavorites = new Set(JSON.parse(localStorage.getItem('pollinsight-font-favorites') || '[]'));
        this.fontRecent = JSON.parse(localStorage.getItem('pollinsight-font-recent') || '["Pretendard","Arial","Times New Roman"]');
        inspector.insertAdjacentHTML('beforeend', `
            <div id="font-picker-v2" class="mt-2 overflow-hidden rounded-lg border border-slate-700 bg-slate-950/60">
                <div class="space-y-2 border-b border-slate-800 p-2">
                    <input id="font-search-v2" type="search" placeholder="글꼴 검색" class="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200">
                    <div class="grid grid-cols-3 gap-1"><button type="button" class="font-filter-v2 rounded bg-blue-600 py-1 text-[10px] text-white" data-filter="recent">최근</button><button type="button" class="font-filter-v2 rounded py-1 text-[10px] text-slate-400 hover:bg-slate-800" data-filter="all">전체</button><button type="button" class="font-filter-v2 rounded py-1 text-[10px] text-slate-400 hover:bg-slate-800" data-filter="favorite">즐겨찾기</button><button type="button" class="font-filter-v2 rounded py-1 text-[10px] text-slate-400 hover:bg-slate-800" data-filter="고딕체">고딕체</button><button type="button" class="font-filter-v2 rounded py-1 text-[10px] text-slate-400 hover:bg-slate-800" data-filter="명조체">명조체</button><button type="button" class="font-filter-v2 rounded py-1 text-[10px] text-slate-400 hover:bg-slate-800" data-filter="손글씨체">손글씨체</button></div>
                </div>
                <div id="font-list-v2" class="max-h-44 overflow-y-auto p-1"></div>
                <div id="font-drop-zone" class="m-2 rounded-lg border border-dashed border-violet-700/80 bg-violet-950/20 p-3 text-center transition"><label class="block cursor-pointer"><input id="font-upload-v2" type="file" accept=".ttf,.otf,.woff,.woff2" multiple class="hidden"><span class="text-[11px] font-bold text-violet-200">글꼴 파일 여러 개 선택 또는 드래그</span></label><p class="mt-1 text-[10px] text-slate-500">TTF · OTF · WOFF · WOFF2</p></div>
            </div>`);
        const escape = value => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[char]));
        const render = () => {
            const list = document.getElementById('font-list-v2'); const query = document.getElementById('font-search-v2')?.value.trim().toLowerCase() || '';
            let fonts = [...this.fontCatalog];
            if (this.fontPickerFilter === 'recent') fonts = fonts.filter(item => this.fontRecent.includes(item.family));
            if (this.fontPickerFilter === 'favorite') fonts = fonts.filter(item => this.fontFavorites.has(item.family));
            if (['고딕체','명조체','손글씨체'].includes(this.fontPickerFilter)) fonts = fonts.filter(item => item.group === this.fontPickerFilter);
            if (query) fonts = fonts.filter(item => `${item.label} ${item.group}`.toLowerCase().includes(query));
            list.innerHTML = fonts.length ? fonts.map(item => `<div class="flex items-center rounded px-1 py-0.5 hover:bg-slate-800"><button type="button" class="font-choice-v2 min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs text-slate-200" data-family="${escape(item.family)}" style="font-family:${escape(item.family)}">${escape(item.label)} <span class="ml-1 text-[9px] text-slate-500">${item.group}</span></button><button type="button" class="font-favorite-v2 px-1.5 text-xs ${this.fontFavorites.has(item.family) ? 'text-amber-300' : 'text-slate-500'}" data-family="${escape(item.family)}">★</button></div>`).join('') : '<p class="p-2 text-[11px] text-slate-500">표시할 글꼴이 없습니다.</p>';
            list.querySelectorAll('.font-choice-v2').forEach(button => button.onclick = () => this.applyFontFamily(button.dataset.family));
            list.querySelectorAll('.font-favorite-v2').forEach(button => button.onclick = () => { const family = button.dataset.family; this.fontFavorites.has(family) ? this.fontFavorites.delete(family) : this.fontFavorites.add(family); localStorage.setItem('pollinsight-font-favorites', JSON.stringify([...this.fontFavorites])); render(); });
        };
        this.renderFontPicker = render;
        this.applyFontFamily = family => { const selected = AppState.getSelectedEls().filter(el => el.type === 'text'); if (!selected.length) return; selected.forEach(el => { el.font = family; }); if (![...select.options].some(option => option.value === family)) select.add(new Option(family, family)); select.value = family; this.fontRecent = [family, ...this.fontRecent.filter(item => item !== family)].slice(0, 8); localStorage.setItem('pollinsight-font-recent', JSON.stringify(this.fontRecent)); HistoryManager.save(); CanvasEngine.draw(); render(); };
        document.querySelectorAll('.font-filter-v2').forEach(button => button.onclick = () => { this.fontPickerFilter = button.dataset.filter; document.querySelectorAll('.font-filter-v2').forEach(item => item.className = `font-filter-v2 rounded py-1 text-[10px] ${item === button ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`); render(); });
        document.getElementById('font-search-v2').oninput = render;
        const classify = label => /손|hand|script|cursive|pen|brush/i.test(label) ? '손글씨체' : /명조|myeongjo|serif|batang|nanum.*m/i.test(label) ? '명조체' : '고딕체';
        const addFiles = async files => { const valid = [...files].filter(file => /\.(ttf|otf|woff2?)$/i.test(file.name)); if (!valid.length) return; const added=[]; for (const file of valid) { const label=file.name.replace(/\.[^.]+$/,'').slice(0,80); const family=`UserFont_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; try { const loaded=await new FontFace(family,`url(${URL.createObjectURL(file)})`).load(); document.fonts.add(loaded); this.fontCatalog.push({family,label,group:classify(label),custom:true}); select.add(new Option(label,family)); added.push(family); } catch(error) { console.warn('Font load failed',file.name,error); } } if(added.length){this.fontPickerFilter='all';this.applyFontFamily(added[0]);render();} };
        const upload = document.getElementById('font-upload-v2'); upload.onchange = async event => { await addFiles(event.target.files || []); event.target.value=''; };
        const dropZone = document.getElementById('font-drop-zone'); ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type,event=>{event.preventDefault();dropZone.classList.add('border-violet-300','bg-violet-900/30');})); ['dragleave','drop'].forEach(type => dropZone.addEventListener(type,event=>{event.preventDefault();dropZone.classList.remove('border-violet-300','bg-violet-900/30');})); dropZone.addEventListener('drop',event=>addFiles(event.dataTransfer?.files || []));
        select.onchange = event => this.applyFontFamily(event.target.value);
        render();
    },

    bindAIControls: function () {
        const btnAIApply = document.getElementById('btn-ai-apply');
        if (btnAIApply) {
            btnAIApply.onclick = async () => {
                const prompt = document.getElementById('ai-element-prompt')?.value;
                if (!prompt) return;

                if (AppState.selectedIds.length === 0) {
                    alert("변경할 요소를 먼저 하나 이상 선택하세요.");
                    return;
                }

                const selectedEl = AppState.getSelectedEls()[0];
                if (AppState.selectedIds.some(id => AppState.getEls()[id]?.locked)) {
                    alert('잠긴 핵심 정보는 AI 변경 대상에서 제외됩니다. 템플릿 제작 모드에서 잠금을 해제한 뒤 수정해 주세요.');
                    return;
                }
                
                // Show thinking status
                btnAIApply.innerText = 'AI 변경 중...';
                btnAIApply.disabled = true;

                try {
                    // Send to backend Gemini API suggestion
                    const response = await fetch('/api/ai/suggest', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ prompt, currentElements: selectedEl })
                    });
                    const result = await response.json();
                    
                    if (result.success && result.ai_suggestion) {
                        // Extract JSON block from markdown response
                        const match = result.ai_suggestion.match(/\{[\s\S]*\}/);
                        if (match) {
                            const parsed = JSON.parse(match[0]);
                            // Merge into selected elements properties
                            AppState.selectedIds.filter(id => !AppState.getEls()[id]?.locked).forEach(id => {
                                const target = AppState.getEls()[id];
                                Object.assign(target, parsed);
                            });
                            HistoryManager.save();
                            CanvasEngine.draw();
                            alert("AI 디자인 추천 변경이 성공적으로 적용되었습니다!");
                        } else {
                            // Heuristics fallback if response is not JSON
                            this.aiHeuristicFallback(prompt, selectedEl);
                        }
                    } else {
                        // Heuristics fallback if fetch fails
                        this.aiHeuristicFallback(prompt, selectedEl);
                    }
                } catch (e) {
                    console.error("AI API Error:", e);
                    this.aiHeuristicFallback(prompt, selectedEl);
                } finally {
                    btnAIApply.innerText = '변환 요청';
                    btnAIApply.disabled = false;
                }
            };
        }
    },

    aiHeuristicFallback: function (prompt, el) {
        if (!el) return;
        if (prompt.includes('빨간') || prompt.includes('빨갛')) el.color = '#ef4444';
        if (prompt.includes('파란') || prompt.includes('파랗')) el.color = '#3b82f6';
        if (prompt.includes('초록') || prompt.includes('푸른')) el.color = '#10b981';
        if (prompt.includes('노란') || prompt.includes('노랗')) el.color = '#f59e0b';
        if (prompt.includes('검은') || prompt.includes('까맣')) el.color = '#000000';
        if (prompt.includes('흰색') || prompt.includes('하얗')) el.color = '#ffffff';

        if (prompt.includes('크게') || prompt.includes('키워')) {
            if (el.type === 'text') el.size = Math.min(200, (el.size || 30) + 15);
            else { el.w += 40; el.h += 40; }
        }
        if (prompt.includes('작게') || prompt.includes('줄여')) {
            if (el.type === 'text') el.size = Math.max(10, (el.size || 30) - 10);
            else { el.w = Math.max(10, el.w - 30); el.h = Math.max(10, el.h - 30); }
        }

        if (prompt.includes('굵게') || prompt.includes('볼드')) el.bold = true;
        if (prompt.includes('기울임') || prompt.includes('이탤릭')) el.italic = true;
        if (prompt.includes('밑줄')) el.underline = true;
        if (prompt.includes('그림자')) el.useShadow = true;
        if (prompt.includes('윤곽선') || prompt.includes('테두리')) el.useOutline = true;

        if (prompt.includes('가운데') || prompt.includes('중앙')) el.align = 'center';
        if (prompt.includes('오른쪽') || prompt.includes('우측')) el.align = 'right';

        HistoryManager.save();
        CanvasEngine.draw();
        alert("로컬 AI 엔진에 의해 디자인 수정이 적용되었습니다.");
    },

    bindPresentationMode: function () {
        const btnPlay = document.getElementById('btn-play-slide');
        const show = document.getElementById('slide-player');
        
        if (btnPlay && show) {
            btnPlay.onclick = () => {
                show.style.display = 'flex';
                this.presentationIdx = AppState.currentIdx;
                this.renderPresentationSlide();
            };
        }

        const closeBtn = document.getElementById('slide-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                show.style.display = 'none';
                CanvasEngine.draw();
            };
        }

        const prevBtn = document.getElementById('slide-prev');
        if (prevBtn) {
            prevBtn.onclick = () => {
                if (this.presentationIdx > 0) {
                    this.presentationIdx--;
                    this.renderPresentationSlide();
                }
            };
        }

        const nextBtn = document.getElementById('slide-next');
        if (nextBtn) {
            nextBtn.onclick = () => {
                if (this.presentationIdx < AppState.pages.length - 1) {
                    this.presentationIdx++;
                    this.renderPresentationSlide();
                }
            };
        }

        // Slide presentation keyboard events
        window.addEventListener('keydown', (e) => {
            if (show.style.display === 'flex') {
                if (e.key === 'ArrowRight' || e.key === ' ') {
                    nextBtn.click();
                } else if (e.key === 'ArrowLeft') {
                    prevBtn.click();
                } else if (e.key === 'Escape') {
                    closeBtn.click();
                }
            }
        });
    },

    renderPresentationSlide: function () {
        const page = AppState.pages[this.presentationIdx];
        const screenCanvas = document.getElementById('slide-screen');
        if (!page || !screenCanvas) return;

        const screenCtx = screenCanvas.getContext('2d');
        screenCanvas.width = page.w;
        screenCanvas.height = page.h;

        // Draw page details onto presentation screen canvas
        const originalIdx = AppState.currentIdx;
        AppState.currentIdx = this.presentationIdx;
        
        // Temporarily bind CanvasEngine details and restore
        const originalCanvas = CanvasEngine.canvas;
        const originalCtx = CanvasEngine.ctx;

        CanvasEngine.canvas = screenCanvas;
        CanvasEngine.ctx = screenCtx;

        CanvasEngine.draw(true); // render clean without handles

        // Restore
        CanvasEngine.canvas = originalCanvas;
        CanvasEngine.ctx = originalCtx;
        AppState.currentIdx = originalIdx;
    },

    bindSharedAssetLibrary: function () {
        const panel = document.getElementById('tab-assets');
        if (!panel || document.getElementById('shared-asset-library')) return;
        const header = panel.querySelector('.p-3');
        const library = document.createElement('section');
        library.id = 'shared-asset-library';
        library.className = 'border-b border-slate-800 bg-slate-950/70 p-3';
        library.innerHTML = '<div class="mb-2 flex items-center justify-between"><span class="text-[11px] font-extrabold text-cyan-300">공유 클립아트 · 요소</span><button id="refresh-shared-assets" class="text-[10px] text-blue-400">새로고침</button></div><label class="mb-2 block"><span class="sr-only">공유 클립아트 검색</span><input id="shared-asset-search" type="search" autocomplete="off" class="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500" placeholder="이름·분류·태그 검색"></label><p id="shared-asset-count" class="mb-2 text-[10px] text-slate-500"></p><div id="shared-asset-list" class="grid grid-cols-2 gap-2"></div>';
        header?.insertAdjacentElement('afterend', library);
        const list = library.querySelector('#shared-asset-list');
        const search = library.querySelector('#shared-asset-search');
        const count = library.querySelector('#shared-asset-count');
        let loadedAssets = [];
        const searchableText = asset => {
            let tags = asset.tags;
            if (typeof tags === 'string') {
                try { tags = JSON.parse(tags); } catch { tags = [tags]; }
            }
            return [asset.title, asset.category, asset.asset_type, ...(Array.isArray(tags) ? tags : [])]
                .filter(Boolean).join(' ').toLocaleLowerCase('ko-KR');
        };
        const paint = () => {
            const keyword = String(search?.value || '').trim().toLocaleLowerCase('ko-KR');
            const assets = keyword ? loadedAssets.filter(asset => searchableText(asset).includes(keyword)) : loadedAssets;
            count.textContent = keyword ? `검색 결과 ${assets.length}개` : `공유 요소 ${assets.length}개`;
            if (!assets.length) {
                list.innerHTML = `<p class="col-span-2 text-[10px] leading-4 text-slate-500">${keyword ? '검색어에 해당하는 공유 요소가 없습니다.' : '등록된 공유 요소가 없습니다.'}</p>`;
                return;
            }
            list.innerHTML = '';
            assets.forEach(asset => {
                const button = document.createElement('button');
                button.type = 'button'; button.className = 'overflow-hidden rounded border border-slate-700 bg-slate-900 text-left hover:border-cyan-500';
                button.innerHTML = `${asset.preview_data ? `<img class="h-16 w-full object-cover" src="${asset.preview_data}" alt="">` : '<div class="grid h-16 place-items-center text-slate-500"><i class="ph-bold ph-shapes"></i></div>'}<span class="block truncate px-2 py-1 text-[10px] font-bold text-slate-200">${String(asset.title || '').replace(/[<>&]/g, '')}</span>`;
                button.onclick = async () => {
                    try {
                        const detailResponse = await fetch(`/api/assets/${asset.id}`, { credentials: 'include' });
                        const detail = await detailResponse.json().catch(() => ({}));
                        if (!detailResponse.ok) throw new Error(detail.message || '요소를 불러올 수 없습니다.');
                        const element = typeof detail.asset.element_data === 'string' ? JSON.parse(detail.asset.element_data) : detail.asset.element_data;
                        const copy = JSON.parse(JSON.stringify(element));
                        copy.x = Math.max(0, CanvasEngine.getPageWidth() / 2 - (copy.w || 120) / 2);
                        copy.y = Math.max(0, CanvasEngine.getPageHeight() / 2 - (copy.h || 80) / 2);
                        if (copy.type === 'image' && copy.imgSrc) { const image = new Image(); image.src = copy.imgSrc; copy.img = image; }
                        const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                        AppState.getEls()[id] = copy; AppState.selectedIds = [id];
                        HistoryManager.save(); CanvasEngine.draw();
                    } catch (error) { alert(error.message || '요소를 불러올 수 없습니다.'); }
                };
                list.appendChild(button);
            });
        };
        const render = async () => {
            list.innerHTML = '<p class="col-span-2 text-[10px] text-slate-500">요소를 불러오는 중…</p>';
            try {
                const response = await fetch('/api/assets', { credentials: 'include' });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.message || '요소를 불러올 수 없습니다.');
                loadedAssets = result.assets || [];
                paint();
            } catch (error) {
                loadedAssets = [];
                count.textContent = '';
                list.innerHTML = `<p class="col-span-2 text-[10px] text-rose-400">${String(error.message || '').replace(/[<>&]/g, '')}</p>`;
            }
        };
        search?.addEventListener('input', paint);
        library.querySelector('#refresh-shared-assets').onclick = render;
        render();
    },

    bindTemplates: function () {
        const loadTemplate = (els) => {
            AppState.getPage().els = JSON.parse(JSON.stringify(els));
            AppState.selectedIds = [];
            AppState.editingCell = null;
            HistoryManager.save();
            CanvasEngine.draw();
            alert("템플릿이 성공적으로 적용되었습니다!");
        };

        const sharedList = document.getElementById('published-template-list');
        const loadSharedTemplates = async () => {
            if (!sharedList) return;
            sharedList.innerHTML = '<p class="text-[11px] text-slate-500">공유 템플릿을 불러오는 중…</p>';
            try {
                const response = await fetch('/api/templates', { credentials: 'include' });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.message || '템플릿을 불러올 수 없습니다.');
                const templates = result.templates || [];
                if (!templates.length) {
                    sharedList.innerHTML = '<p class="text-[11px] leading-5 text-slate-500">아직 공개된 템플릿이 없습니다. 관리자가 제작 모드에서 등록하면 이곳에 표시됩니다.</p>';
                    return;
                }
                sharedList.innerHTML = '';
                templates.forEach(template => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'w-full text-left rounded-lg border border-slate-700 bg-slate-900/60 p-3 hover:border-blue-500 hover:bg-slate-800 transition';
                    const tags = Array.isArray(template.tags) ? template.tags.slice(0, 3).map(tag => `#${tag}`).join(' ') : '';
                    button.innerHTML = `<div class="text-xs font-bold text-slate-100">${String(template.title || '').replace(/[<>&]/g, '')}</div><div class="mt-1 text-[10px] text-slate-400">${String(template.category || 'general').replace(/[<>&]/g, '')} ${tags}</div>`;
                    button.onclick = async () => {
                        try {
                            const detailResponse = await fetch(`/api/templates/${template.id}`, { credentials: 'include' });
                            const detail = await detailResponse.json().catch(() => ({}));
                            if (!detailResponse.ok) throw new Error(detail.message || '템플릿을 열 수 없습니다.');
                            const state = typeof detail.template.design_state === 'string' ? JSON.parse(detail.template.design_state) : detail.template.design_state;
                            ProjectService.currentProjectId = null;
                            ProjectService.currentFolderId = null;
                            ProjectService.applyProject({ ...state, title: detail.template.title });
                            HistoryManager.save();
                            CanvasEngine.draw();
                            this.zoomToFit();
                            alert('공유 템플릿을 편집기에 불러왔습니다.');
                        } catch (error) { alert(error.message || '템플릿을 열 수 없습니다.'); }
                    };
                    sharedList.appendChild(button);
                });
            } catch (error) {
                sharedList.innerHTML = `<p class="text-[11px] text-rose-400">${String(error.message || '템플릿을 불러올 수 없습니다.').replace(/[<>&]/g, '')}</p>`;
            }
        };
        document.getElementById('refresh-published-templates')?.addEventListener('click', loadSharedTemplates);
        loadSharedTemplates();

        const t1 = document.getElementById('temp-card-news');
        if (t1) {
            t1.onclick = () => {
                const els = {
                    title: { type: 'text', text: '정치 개혁 선언\n대한민국의 새로운 기준', x: 540, y: 220, w: 900, h: 200, size: 70, color: '#1e3a8a', align: 'center', bold: true, rot: 0, opacity: 1 },
                    body: { type: 'text', text: '국민을 위한 혁신, 미래를 여는 정책 토론회 개최\n2026년 8월 국회의사당 대강당', x: 540, y: 520, w: 800, h: 100, size: 36, color: '#475569', align: 'center', rot: 0, opacity: 1 },
                    decoRect: { type: 'rect', x: 440, y: 440, w: 200, h: 8, color: '#3b82f6', rot: 0, opacity: 1 },
                    decoCircle1: { type: 'circle', x: 200, y: 150, w: 80, h: 80, color: '#eff6ff', rot: 0, opacity: 0.8 },
                    decoCircle2: { type: 'circle', x: 800, y: 680, w: 120, h: 120, color: '#dbeafe', rot: 0, opacity: 0.6 }
                };
                loadTemplate(els);
            };
        }

        const t2 = document.getElementById('temp-infographic');
        if (t2) {
            t2.onclick = () => {
                const els = {
                    title: { type: 'text', text: '숫자로 보는 정당 지지도', x: 540, y: 120, w: 800, h: 100, size: 60, color: '#0f172a', align: 'center', bold: true, rot: 0, opacity: 1 },
                    chart1: {
                        type: 'chart', chartType: 'bar', x: 140, y: 240, w: 800, h: 480,
                        labels: ['가선거구', '나선거구', '다선거구', '라선거구'],
                        data: [42, 68, 55, 87],
                        colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
                        rot: 0, opacity: 1
                    },
                    caption: { type: 'text', text: '※ 해당 조사는 국회 여론조사 소위원회 기준 2026년 7월 지지도 가상 시뮬레이션 데이터입니다.', x: 540, y: 790, w: 900, h: 80, size: 20, color: '#94a3b8', align: 'center', rot: 0, opacity: 1 }
                };
                loadTemplate(els);
            };
        }

        const t3 = document.getElementById('temp-comparison');
        if (t3) {
            t3.onclick = () => {
                const els = {
                    title: { type: 'text', text: '정책 대안비교 핵심요약', x: 540, y: 100, w: 800, h: 100, size: 55, color: '#1e293b', align: 'center', bold: true, rot: 0, opacity: 1 },
                    table1: {
                        type: 'table', x: 140, y: 220, w: 800, h: 360, rows: 4, cols: 3,
                        cells: [
                            [{ text: '구분', bold: true, align: 'center', bgColor: '#f1f5f9' }, { text: '현행 정책', bold: true, align: 'center', bgColor: '#f1f5f9' }, { text: '개정 대안', bold: true, align: 'center', bgColor: '#f8fafc' }],
                            [{ text: '지원 대상', bold: true, align: 'center', bgColor: '#f8fafc' }, { text: '중위소득 120% 이하' }, { text: '중위소득 150% 이하 확대', bold: true, color: '#2563eb' }],
                            [{ text: '지원 금액', bold: true, align: 'center', bgColor: '#f8fafc' }, { text: '가구당 15만원' }, { text: '가구당 25만원 인상', bold: true, color: '#2563eb' }],
                            [{ text: '재원 마련', bold: true, align: 'center', bgColor: '#f8fafc' }, { text: '지방자치 교부금' }, { text: '국고 보조금 50% 매칭' }]
                        ],
                        borderColor: '#cbd5e1', borderWidth: 1, rot: 0, opacity: 1
                    },
                    subtext: { type: 'text', text: '기존 정책 대비 복지 안전망을 강화하고 소득 경계에 걸친 취약가구 해소를 위한 맞춤형 설계 추진', x: 140, y: 640, w: 800, h: 120, size: 28, color: '#475569', align: 'left', rot: 0, opacity: 1 }
                };
                loadTemplate(els);
            };
        }
    },

    updatePanels: function () {
        const adv = document.getElementById('advanced-panel');
        const emp = document.getElementById('empty-state');
        const ft = document.getElementById('floating-toolbar');

        this.renderPageList();

        if (AppState.selectedIds.length === 0) {
            if (adv) adv.style.display = 'none';
            if (emp) emp.style.display = 'block';
            if (ft) ft.style.display = 'none';
            return;
        }

        if (adv) adv.style.display = 'block';
        if (emp) emp.style.display = 'none';

        const el = AppState.getEls()[AppState.selectedIds[0]];
        if (!el) return;

        // Position Floating toolbar near element bounding box
        if (ft && el._bbox) {
            const cv = CanvasEngine.canvas;
            const r = cv.getBoundingClientRect();
            const scaleX = r.width / cv.width;
            const scaleY = r.height / cv.height;
            
            const bleedX = CanvasEngine.viewportBleedX ?? CanvasEngine.viewportBleed ?? 0;
            const bleedY = CanvasEngine.viewportBleedY ?? CanvasEngine.viewportBleed ?? 0;
            const elementLeft = r.left + ((el._bbox.x + bleedX) * scaleX);
            const elementTop = r.top + ((el._bbox.y + bleedY) * scaleY);
            const elementRight = elementLeft + (el._bbox.w * scaleX);
            const elementBottom = elementTop + (el._bbox.h * scaleY);

            // Render once to measure the toolbar, then place it outside the
            // selected bounds. It never uses the element's interior as an
            // anchor, which keeps text and thin lines unobscured.
            ft.style.display = 'flex';
            ft.style.visibility = 'hidden';
            const toolbarRect = ft.getBoundingClientRect();
            const gap = 12;
            let left = elementRight + gap;
            let top = elementTop + (elementBottom - elementTop - toolbarRect.height) / 2;
            if (left + toolbarRect.width > window.innerWidth - gap) left = elementLeft - toolbarRect.width - gap;
            if (left < gap) {
                left = Math.max(gap, Math.min(window.innerWidth - toolbarRect.width - gap, elementLeft));
                top = elementTop - toolbarRect.height - gap;
                if (top < gap) top = elementBottom + gap;
            }
            top = Math.max(gap, Math.min(window.innerHeight - toolbarRect.height - gap, top));
            ft.style.left = `${left}px`;
            ft.style.top = `${top}px`;
            ft.style.visibility = 'visible';
        }

        // Synchronize Right Sidebar input fields
        const colorInput = document.getElementById('prop-color');
        if (colorInput) colorInput.value = el.color || '#000000';
        const templateRole = document.getElementById('template-role');
        if (templateRole) templateRole.value = el.templateRole || '';
        const templateLocked = document.getElementById('template-locked');
        if (templateLocked) templateLocked.checked = Boolean(el.locked);

        const textCtrls = document.getElementById('adv-text-controls');
        const chartCtrls = document.getElementById('adv-chart-controls');
        const tableCtrls = document.getElementById('adv-table-controls');
        const shapeCtrls = document.getElementById('adv-shape-controls');
        const transformCtrls = document.getElementById('adv-transform-controls');
        const imageCtrls = document.getElementById('adv-image-controls');

        if (textCtrls) textCtrls.style.display = 'none';
        if (chartCtrls) chartCtrls.style.display = 'none';
        if (tableCtrls) tableCtrls.style.display = 'none';
        if (shapeCtrls) shapeCtrls.style.display = 'none';
        if (imageCtrls) imageCtrls.style.display = 'none';
        if (transformCtrls) transformCtrls.style.display = 'block';
        const universalRotation = document.getElementById('prop-rotation');
        if (universalRotation) universalRotation.value = Math.round(Number(el.rot) || 0);
        const setEffectValue = (id, value) => { const input = document.getElementById(id); if (input) input.value = value; };
        const shadowOpacity = Math.round((el.shadowOpacity ?? 0.4) * 100);
        const elementOpacity = Math.round((el.opacity ?? 1) * 100);
        const shadowToggle = document.getElementById('chk-element-shadow'); if (shadowToggle) shadowToggle.checked = Boolean(el.useShadow);
        setEffectValue('prop-shadow-x', el.shadowOffsetX ?? 4); setEffectValue('prop-shadow-y', el.shadowOffsetY ?? 4); setEffectValue('prop-shadow-blur', el.shadowBlur ?? 8); setEffectValue('prop-shadow-color', el.shadowColor || '#000000'); setEffectValue('prop-shadow-opacity', shadowOpacity); setEffectValue('prop-opacity', elementOpacity);
        const shadowOpacityLabel = document.getElementById('val-shadow-opacity'); if (shadowOpacityLabel) shadowOpacityLabel.innerText = shadowOpacity;
        const elementOpacityLabel = document.getElementById('val-element-opacity'); if (elementOpacityLabel) elementOpacityLabel.innerText = elementOpacity;

        if (el.type === 'image') {
            if (imageCtrls) imageCtrls.style.display = 'block';
            const setImageValue = (id, value, labelId = null) => {
                const input = document.getElementById(id);
                if (input) input.value = value;
                const label = labelId && document.getElementById(labelId);
                if (label) label.innerText = value;
            };
            setImageValue('image-crop-scale', Math.round((el.cropScale ?? 1) * 100), 'val-image-crop-scale');
            setImageValue('image-crop-x', el.cropOffsetX ?? 0);
            setImageValue('image-crop-y', el.cropOffsetY ?? 0);
            setImageValue('image-brightness', el.imageBrightness ?? 100, 'val-image-brightness');
            setImageValue('image-contrast', el.imageContrast ?? 100, 'val-image-contrast');
            setImageValue('image-saturation', el.imageSaturation ?? 100, 'val-image-saturation');
            setImageValue('image-blur', el.imageBlur ?? 0, 'val-image-blur');
            setImageValue('image-hue', el.imageHue ?? 0, 'val-image-hue');
            setImageValue('image-border-color', el.imageBorderColor || '#000000');
            setImageValue('image-border-width', el.imageBorderWidth ?? 0);
            setImageValue('image-background-color', el.imageBackgroundColor || '#ffffff');
            setImageValue('image-tint-color', el.imageTintColor || '#2563eb');
            setImageValue('image-tint-opacity', el.imageTintOpacity ?? 0, 'val-image-tint-opacity');
            const grayscale = document.getElementById('image-grayscale'); if (grayscale) grayscale.checked = Boolean(el.imageGrayscale);
            const invert = document.getElementById('image-invert'); if (invert) invert.checked = Boolean(el.imageInvert);
            const linkEnabled = document.getElementById('image-link-enabled'); if (linkEnabled) linkEnabled.checked = Boolean(el.linkEnabled);
            const linkUrl = document.getElementById('image-link-url'); if (linkUrl) linkUrl.value = el.linkUrl || '';
        } else if (el.type === 'text') {
            if (textCtrls) textCtrls.style.display = 'block';
            const fontSelect = document.getElementById('prop-font-family');
            if (fontSelect) {
                const family = el.font || 'Pretendard';
                if (![...fontSelect.options].some(option => option.value === family)) fontSelect.add(new Option(family, family));
                fontSelect.value = family;
            }
            this.renderFontPicker?.();
            
            const sizeInput = document.getElementById('adv-size');
            if (sizeInput) sizeInput.value = el.size || 30;

            const spacingInput = document.getElementById('adv-spacing');
            if (spacingInput) spacingInput.value = el.spacing || 0;
            const spacingVal = document.getElementById('val-spacing');
            if (spacingVal) spacingVal.innerText = el.spacing || 0;

            const lhInput = document.getElementById('adv-lineheight');
            if (lhInput) lhInput.value = el.lineHeight || 1.3;
            const lhVal = document.getElementById('val-lineheight');
            if (lhVal) lhVal.innerText = el.lineHeight || 1.3;

            const scaleInput = document.getElementById('adv-scale');
            if (scaleInput) scaleInput.value = Math.round((el.scaleX || 1) * 100);
            const scaleVal = document.getElementById('val-scale');
            if (scaleVal) scaleVal.innerText = Math.round((el.scaleX || 1) * 100);

            // Bold/Italic/Underline button highlight colors
            const bBtn = document.getElementById('adv-bold');
            if (bBtn) bBtn.style.backgroundColor = el.bold ? '#eff6ff' : '';
            const iBtn = document.getElementById('adv-italic');
            if (iBtn) iBtn.style.backgroundColor = el.italic ? '#eff6ff' : '';
            const uBtn = document.getElementById('adv-underline');
            if (uBtn) uBtn.style.backgroundColor = el.underline ? '#eff6ff' : '';

            // Checkboxes
            const chkBg = document.getElementById('chk-bg');
            if (chkBg) chkBg.checked = !!el.useBg;
            const colorBg = document.getElementById('color-bg');
            if (colorBg) colorBg.value = el.bgColor || '#ffffff';

            const chkOutline = document.getElementById('chk-outline');
            if (chkOutline) chkOutline.checked = !!el.useOutline;
            const valOutline = document.getElementById('val-outline');
            if (valOutline) valOutline.value = el.outlineWidth || 2;
            const colorOutline = document.getElementById('color-outline');
            if (colorOutline) colorOutline.value = el.outlineColor || '#000000';

            const chkDouble = document.getElementById('chk-double');
            if (chkDouble) chkDouble.checked = !!el.useDoubleOutline;
            const valDouble = document.getElementById('val-double');
            if (valDouble) valDouble.value = el.doubleWidth || 5;
            const colorDouble = document.getElementById('color-double');
            if (colorDouble) colorDouble.value = el.doubleColor || '#ffffff';

            const chkShadow = document.getElementById('chk-shadow');
            if (chkShadow) chkShadow.checked = !!el.useShadow;
            const colorShadow = document.getElementById('color-shadow');
            if (colorShadow) colorShadow.value = el.shadowColor || '#000000';
            
            // Align
            document.querySelectorAll('.align-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.align === (el.align || 'left')) {
                    btn.classList.add('active');
                }
            });

        } else if (['rect', 'circle', 'triangle', 'star', 'polygon', 'line'].includes(el.type)) {
            if (shapeCtrls) shapeCtrls.style.display = 'block';

            const shapeFillType = document.getElementById('shape-fill-type');
            const shapeFillControls = document.getElementById('shape-fill-controls');
            const shapeGradientControls = document.getElementById('shape-gradient-controls');
            const shapeGradientType = document.getElementById('shape-gradient-type');
            const shapeGradientAngleWrap = document.getElementById('shape-gradient-angle-wrap');
            const shapeGradientColor1 = document.getElementById('shape-gradient-color-1');
            const shapeGradientColor2 = document.getElementById('shape-gradient-color-2');
            const shapeGradientAngle = document.getElementById('shape-gradient-angle');
            const shapeGradientAngleValue = document.getElementById('shape-gradient-angle-value');
            if (shapeFillControls) shapeFillControls.classList.toggle('hidden', el.type === 'line');
            if (shapeFillType) shapeFillType.value = el.fillType || 'solid';
            if (shapeGradientControls) shapeGradientControls.classList.toggle('hidden', (el.fillType || 'solid') !== 'gradient');
            if (shapeGradientType) shapeGradientType.value = el.gradientType || 'linear';
            if (shapeGradientAngleWrap) shapeGradientAngleWrap.classList.toggle('hidden', (el.gradientType || 'linear') === 'radial');
            if (shapeGradientColor1) shapeGradientColor1.value = el.gradientColor1 || el.color || '#3b82f6';
            if (shapeGradientColor2) shapeGradientColor2.value = el.gradientColor2 || '#ffffff';
            if (shapeGradientAngle) shapeGradientAngle.value = Number(el.gradientAngle) || 0;
            if (shapeGradientAngleValue) shapeGradientAngleValue.textContent = Number(el.gradientAngle) || 0;

            const shapeStrokeGradientControls = document.getElementById('shape-stroke-gradient-controls');
            const shapeStrokeFillType = document.getElementById('shape-stroke-fill-type');
            const shapeStrokeGradientOptions = document.getElementById('shape-stroke-gradient-options');
            const shapeStrokeGradientType = document.getElementById('shape-stroke-gradient-type');
            const shapeStrokeGradientAngleWrap = document.getElementById('shape-stroke-gradient-angle-wrap');
            const shapeStrokeGradientColor1 = document.getElementById('shape-stroke-gradient-color-1');
            const shapeStrokeGradientColor2 = document.getElementById('shape-stroke-gradient-color-2');
            const shapeStrokeGradientAngle = document.getElementById('shape-stroke-gradient-angle');
            const shapeStrokeGradientAngleValue = document.getElementById('shape-stroke-gradient-angle-value');
            if (shapeStrokeGradientControls) shapeStrokeGradientControls.classList.toggle('hidden', el.type === 'line');
            if (shapeStrokeFillType) shapeStrokeFillType.value = el.strokeFillType || 'solid';
            if (shapeStrokeGradientOptions) shapeStrokeGradientOptions.classList.toggle('hidden', (el.strokeFillType || 'solid') !== 'gradient');
            if (shapeStrokeGradientType) shapeStrokeGradientType.value = el.strokeGradientType || 'linear';
            if (shapeStrokeGradientAngleWrap) shapeStrokeGradientAngleWrap.classList.toggle('hidden', (el.strokeGradientType || 'linear') === 'radial');
            if (shapeStrokeGradientColor1) shapeStrokeGradientColor1.value = el.strokeGradientColor1 || el.strokeColor || '#000000';
            if (shapeStrokeGradientColor2) shapeStrokeGradientColor2.value = el.strokeGradientColor2 || '#ffffff';
            if (shapeStrokeGradientAngle) shapeStrokeGradientAngle.value = Number(el.strokeGradientAngle) || 0;
            if (shapeStrokeGradientAngleValue) shapeStrokeGradientAngleValue.textContent = Number(el.strokeGradientAngle) || 0;

            const lineControls = document.getElementById('line-controls');
            if (lineControls) lineControls.classList.toggle('hidden', el.type !== 'line');
            if (el.type === 'line') {
                const setLineValue = (id, value) => { const input = document.getElementById(id); if (input) input.value = value; };
                setLineValue('line-color', el.color || '#334155');
                setLineValue('line-width', el.strokeWidth || 4);
                setLineValue('line-style', el.lineStyle || (el.dashed ? 'dashed' : 'solid'));
                setLineValue('line-cap', el.lineCap || 'butt');
                setLineValue('line-dash-length', el.dashLength || 12);
                setLineValue('line-dash-gap', el.dashGap || 8);
                setLineValue('line-start-cap', el.startCap || 'none');
                setLineValue('line-end-cap', el.endCap || (el.arrowEnd ? 'arrow' : 'none'));
            }

            const shapeStrokeColor = document.getElementById('prop-shape-stroke-color');
            if (shapeStrokeColor) shapeStrokeColor.value = el.strokeColor || '#000000';

            const shapeStrokeWidth = document.getElementById('prop-shape-stroke-width');
            if (shapeStrokeWidth) shapeStrokeWidth.value = el.strokeWidth || 0;

            const shapeBorderRadius = document.getElementById('prop-shape-border-radius');
            if (shapeBorderRadius) {
                shapeBorderRadius.value = el.borderRadius || 0;
                const radiusLabel = shapeBorderRadius.previousElementSibling;
                if (el.type === 'rect') {
                    shapeBorderRadius.style.display = 'block';
                    if (radiusLabel) radiusLabel.style.display = 'block';
                } else {
                    shapeBorderRadius.style.display = 'none';
                    if (radiusLabel) radiusLabel.style.display = 'none';
                }
            }

            const shapeOpacity = document.getElementById('prop-shape-opacity');
            if (shapeOpacity) shapeOpacity.value = el.opacity !== undefined ? el.opacity : 1;

        } else if (el.type === 'chart') {
            if (chartCtrls) chartCtrls.style.display = 'block';
            const grid = document.getElementById('chart-data-grid');
            if (grid) {
                grid.innerHTML = '';
                const lbls = el.labels || [];
                const vals = el.data || [];
                
                lbls.forEach((l, idx) => {
                    const row = document.createElement('div');
                    row.className = 'chart-data-row flex gap-1 items-center mb-1';
                    row.innerHTML = `
                        <input type="text" class="chart-lbl w-1/2 p-1 border rounded text-xs" value="${l}">
                        <input type="number" class="chart-val w-1/3 p-1 border rounded text-xs text-center" value="${vals[idx] || 0}">
                        <button class="btn-chart-del text-red-500 text-xs px-1 hover:bg-red-50 rounded" data-index="${idx}"><i class="ph ph-trash"></i></button>
                    `;
                    grid.appendChild(row);

                    row.querySelector('.btn-chart-del').onclick = (e) => {
                        e.stopPropagation();
                        el.labels.splice(idx, 1);
                        el.data.splice(idx, 1);
                        HistoryManager.save();
                        this.updatePanels();
                        CanvasEngine.draw();
                    };
                });
            }
        } else if (el.type === 'table') {
            if (tableCtrls) tableCtrls.style.display = 'block';
            
            const cellInfo = AppState.editingCell;
            const picker = document.getElementById('table-cell-color');
            const cellTextArea = document.getElementById('table-cell-text');
            
            if (cellInfo && cellInfo.id === el._id) {
                const cell = el.cells[cellInfo.r][cellInfo.c];
                if (picker && cell) picker.value = cell.bgColor || '#ffffff';
                if (cellTextArea) cellTextArea.value = cell ? cell.text || '' : '';
                const selection = AppState.tableSelection || cellInfo;
                const anchor = selection.anchor || selection, focus = selection.focus || selection;
                const count = (Math.abs(focus.r - anchor.r) + 1) * (Math.abs(focus.c - anchor.c) + 1);
                const label = document.getElementById('table-selection-label'); if (label) label.innerText = `${count}개 셀 선택`;
                const setCellControl = (id, value) => { const input=document.getElementById(id); if(input) input.value=value; };
                const fontControl = document.getElementById('table-cell-font');
                if (fontControl && cell) { const family = cell.font || 'Pretendard'; if (![...fontControl.options].some(option => option.value === family)) fontControl.add(new Option(family, family)); fontControl.value = family; }
                setCellControl('table-cell-size', cell.size || 14); setCellControl('table-cell-text-color', cell.color || '#1e293b');
                [['table-cell-bold','bold'],['table-cell-italic','italic'],['table-cell-underline','underline']].forEach(([id,property]) => { const button=document.getElementById(id); if(button) button.classList.toggle('bg-blue-600', Boolean(cell[property])); });
                document.querySelectorAll('.table-cell-align').forEach(button => button.classList.toggle('bg-blue-600', button.dataset.align === (cell.align || 'center')));
            } else {
                if (cellTextArea) cellTextArea.value = '';
            }
            const setValue = (id, value) => {
                const input = document.getElementById(id);
                if (input) input.value = value;
            };
            const borderTarget = document.getElementById('table-border-target');
            const activeSelection = AppState.tableSelection || AppState.editingCell;
            const useSelectedCells = borderTarget?.value === 'selected' && activeSelection?.id === el._id;
            const borderCell = useSelectedCells ? el.cells?.[activeSelection.anchor?.r ?? activeSelection.r]?.[activeSelection.anchor?.c ?? activeSelection.c] : null;
            const borderSource = borderCell || el;
            setValue('table-border-style', borderSource.borderStyle || el.borderStyle || 'solid');
            setValue('table-border-color', borderSource.borderColor || el.borderColor || '#cbd5e1');
            setValue('table-border-width', borderSource.borderWidth || el.borderWidth || 1);
            setValue('table-dash-length', borderSource.dashLength || el.dashLength || 8);
            setValue('table-dash-gap', borderSource.dashGap || el.dashGap || 5);
        }

        // Synchronize Page Background Border inputs
        const page = AppState.getPage();
        if (page) {
            const pageBgStrokeColor = document.getElementById('page-bg-stroke-color');
            if (pageBgStrokeColor) pageBgStrokeColor.value = page.bgStrokeColor || '#000000';

            const pageBgStrokeWidth = document.getElementById('page-bg-stroke-width');
            if (pageBgStrokeWidth) pageBgStrokeWidth.value = page.bgStrokeWidth || 0;
        }
 
        this.renderLayerList();
        this.renderPageList();
    },

    renderLayerList: function () {
        const list = document.getElementById('layer-list');
        if (!list) return;
        
        list.innerHTML = '';
        const els = AppState.getEls();
        const keys = Object.keys(els).reverse(); // top element rendering first in list

        if (keys.length === 0) {
            list.innerHTML = '<div class="text-[11px] text-slate-400 text-center py-4">도면에 생성된 레이어가 없습니다.</div>';
            return;
        }

        keys.forEach(k => {
            const el = els[k];
            const item = document.createElement('div');
            const isSelected = AppState.selectedIds.includes(k);
            
            item.className = `p-2 text-xs border rounded cursor-pointer flex justify-between items-center transition ${isSelected ? 'bg-blue-50 border-blue-300 font-semibold text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`;

            let icon = 'ph-shapes';
            let name = '도형 요소';
            
            if (el.type === 'text') {
                icon = 'ph-text-t';
                name = `[텍스트] ${el.text.substring(0, 12)}${el.text.length > 12 ? '...' : ''}`;
            } else if (el.type === 'image') {
                icon = 'ph-image';
                name = '[이미지] 레이어';
            } else if (el.type === 'table') {
                icon = 'ph-table';
                name = `[표] ${el.rows}행 x ${el.cols}열`;
            } else if (el.type === 'chart') {
                icon = 'ph-chart-bar';
                name = `[차트] ${el.chartType === 'bar' ? '막대' : (el.chartType === 'line' ? '선' : '원')}형`;
            } else if (el.type === 'circle') {
                icon = 'ph-circle';
                name = '[원형] 요소';
            } else if (el.type === 'rect') {
                icon = 'ph-square';
                name = '[사각형] 요소';
            } else if (el.type === 'triangle') {
                icon = 'ph-triangle';
                name = '[삼각형] 요소';
            }

            item.innerHTML = `
                <div class="flex items-center gap-2 truncate">
                    <i class="ph-bold ${icon} text-sm"></i>
                    <span class="truncate">${name}</span>
                </div>
                <div class="flex gap-1.5 shrink-0">
                    <button class="layer-up hover:bg-slate-200 rounded p-0.5" title="레이어 위로"><i class="ph ph-caret-up"></i></button>
                    <button class="layer-down hover:bg-slate-200 rounded p-0.5" title="레이어 아래로"><i class="ph ph-caret-down"></i></button>
                    <button class="layer-lock hover:bg-slate-200 rounded p-0.5" title="잠금/해제"><i class="ph ${el.locked ? 'ph-lock-key' : 'ph-lock-key-open'}"></i></button>
                    <button class="layer-del hover:bg-red-50 text-red-400 hover:text-red-600 rounded p-0.5" title="삭제"><i class="ph ph-trash"></i></button>
                </div>
            `;

            item.onclick = (e) => {
                if (e.target.closest('button')) return;
                AppState.selectedIds = [k];
                AppState.editingCell = null;
                CanvasEngine.draw();
            };

            item.querySelector('.layer-up').onclick = (e) => {
                e.stopPropagation();
                this.reorderLayer(k, 'up');
            };

            item.querySelector('.layer-down').onclick = (e) => {
                e.stopPropagation();
                this.reorderLayer(k, 'down');
            };

            item.querySelector('.layer-lock').onclick = (e) => {
                e.stopPropagation();
                el.locked = !el.locked;
                HistoryManager.save();
                CanvasEngine.draw();
            };

            item.querySelector('.layer-del').onclick = (e) => {
                e.stopPropagation();
                delete els[k];
                AppState.selectedIds = AppState.selectedIds.filter(id => id !== k);
                HistoryManager.save();
                CanvasEngine.draw();
            };

            list.appendChild(item);
        });
    },

    reorderLayer: function (id, direction) {
        const els = AppState.getEls();
        const keys = Object.keys(els);
        const idx = keys.indexOf(id);

        if (direction === 'up' && idx < keys.length - 1) {
            const temp = keys[idx];
            keys[idx] = keys[idx + 1];
            keys[idx + 1] = temp;
        } else if (direction === 'down' && idx > 0) {
            const temp = keys[idx];
            keys[idx] = keys[idx - 1];
            keys[idx - 1] = temp;
        }

        const newEls = {};
        keys.forEach(k => {
            newEls[k] = els[k];
        });
        
        AppState.getPage().els = newEls;
        HistoryManager.save();
        CanvasEngine.draw();
    },

    renderPageList: function () {
        const list = document.getElementById('page-list');
        if (!list) return;
        list.innerHTML = '';

        AppState.pages.forEach((page, idx) => {
            const item = document.createElement('div');
            const isActive = AppState.currentIdx === idx;
            
            item.className = `p-2.5 rounded-lg border cursor-pointer relative flex flex-col gap-1 transition ${isActive ? 'border-blue-600 bg-blue-950/40 ring-1 ring-blue-500/50' : 'border-slate-800 bg-slate-950/20 hover:bg-slate-800/40'}`;

            item.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="text-[11px] font-bold text-slate-300">${idx + 1}. ${page.title || '슬라이드'}</span>
                    <div class="flex gap-1.5">
                        <button class="btn-page-up text-slate-500 hover:text-slate-200 p-0.5" title="위로"><i class="ph ph-caret-up"></i></button>
                        <button class="btn-page-down text-slate-500 hover:text-slate-200 p-0.5" title="아래로"><i class="ph ph-caret-down"></i></button>
                        <button class="btn-page-del text-red-500/70 hover:text-red-400 p-0.5" title="삭제"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
                <div class="w-full aspect-[4/3] bg-slate-900 border border-slate-800/60 shadow-sm rounded flex items-center justify-center text-[10px] text-slate-500 font-medium">
                    ${page.w} x ${page.h}
                </div>
            `;

            item.onclick = (e) => {
                if (e.target.closest('button')) return;
                this.switchPage(idx);
            };
            item.onpointerdown = (e) => {
                if (e.button !== 0 || e.target.closest('button')) return;
                // Select on press, not only on the eventual click. This also
                // makes the thumbnail list reliable on touch devices.
                this.switchPage(idx);
            };

            item.querySelector('.btn-page-up').onclick = (e) => {
                e.stopPropagation();
                if (idx > 0) {
                    const temp = AppState.pages[idx];
                    AppState.pages[idx] = AppState.pages[idx - 1];
                    AppState.pages[idx - 1] = temp;
                    if (AppState.currentIdx === idx) AppState.currentIdx = idx - 1;
                    else if (AppState.currentIdx === idx - 1) AppState.currentIdx = idx;
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };

            item.querySelector('.btn-page-down').onclick = (e) => {
                e.stopPropagation();
                if (idx < AppState.pages.length - 1) {
                    const temp = AppState.pages[idx];
                    AppState.pages[idx] = AppState.pages[idx + 1];
                    AppState.pages[idx + 1] = temp;
                    if (AppState.currentIdx === idx) AppState.currentIdx = idx + 1;
                    else if (AppState.currentIdx === idx + 1) AppState.currentIdx = idx;
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };

            item.querySelector('.btn-page-del').onclick = (e) => {
                e.stopPropagation();
                if (AppState.pages.length > 1) {
                    AppState.pages.splice(idx, 1);
                    if (AppState.currentIdx >= AppState.pages.length) {
                        AppState.currentIdx = AppState.pages.length - 1;
                    }
                    AppState.selectedIds = [];
                    HistoryManager.save();
                    CanvasEngine.draw();
                } else {
                    alert("최소 하나의 페이지가 필요합니다.");
                }
            };

            list.appendChild(item);
        });
        this.renderContinuousPagePreviews();
    },

    renderContinuousPagePreviews: function (force = false) {
        const before = document.getElementById('continuous-pages-before');
        const after = document.getElementById('continuous-pages-after');
        const canvas = CanvasEngine.canvas;
        const activeIndicator = document.getElementById('active-page-indicator');
        if (!before || !after || !canvas || !AppState.pages?.length) return;

        const activeIndex = AppState.currentIdx;
        const pageIndices = AppState.pages.map((_, index) => index).filter(index => index !== activeIndex);
        const cache = this.continuousPreviewCache || (this.continuousPreviewCache = new Map());
        const missing = force || pageIndices.some(index => !cache.has(AppState.pages[index].id));

        if (missing) {
            const originalIndex = AppState.currentIdx;
            pageIndices.forEach(index => {
                AppState.currentIdx = index;
                CanvasEngine.draw(true, true);
                cache.set(AppState.pages[index].id, canvas.toDataURL('image/png'));
            });
            AppState.currentIdx = originalIndex;
            CanvasEngine.draw(false, true);
        }

        const renderGroup = (container, indices) => {
            container.innerHTML = '';
            indices.forEach(index => {
                const page = AppState.pages[index];
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'continuous-page-preview';
                card.style.width = `${page.w}px`;
                card.title = `${index + 1}번 페이지 열기`;
                card.innerHTML = `<img alt="${index + 1}번 페이지 미리보기"><span>${index + 1}</span>`;
                card.querySelector('img').src = cache.get(page.id) || '';
                const selectPreviewPage = event => {
                    if (event?.button !== undefined && event.button !== 0) return;
                    event?.preventDefault();
                    this.switchPage(index);
                };
                // Preview pages are not passive screenshots: their entire
                // surface selects that page before the browser click delay.
                card.onpointerdown = selectPreviewPage;
                card.onclick = selectPreviewPage;
                container.appendChild(card);
            });
        };
        renderGroup(before, pageIndices.filter(index => index < activeIndex));
        renderGroup(after, pageIndices.filter(index => index > activeIndex));

        // The live canvas is the page currently being edited.  Give it a
        // clear frame and label; the small number badges on previews only
        // identify neighbouring pages and must not look like a selection.
        if (activeIndicator) {
            activeIndicator.textContent = `편집 중 · ${activeIndex + 1}페이지`;
            activeIndicator.style.left = `${canvas.offsetLeft + 14}px`;
            activeIndicator.style.top = `${canvas.offsetTop + 14}px`;
        }
        this.refreshPageNavigationStatus();
    },

    bindGroupControls: function () {
        const performGroup = () => {
            const elsObj = AppState.getEls();
            if (AppState.selectedIds.length > 1) {
                const groupId = 'group_' + Math.random().toString(36).substring(2, 9);
                AppState.selectedIds.forEach(id => {
                    if (elsObj[id]) elsObj[id].groupId = groupId;
                });
                HistoryManager.save();
                CanvasEngine.draw();
                alert("선택된 요소들이 그룹화되었습니다!");
            } else {
                alert("그룹화하려면 2개 이상의 요소를 선택해야 합니다.");
            }
        };

        const performUngroup = () => {
            const elsObj = AppState.getEls();
            let ungrouped = false;
            AppState.selectedIds.forEach(id => {
                if (elsObj[id] && elsObj[id].groupId) {
                    delete elsObj[id].groupId;
                    ungrouped = true;
                }
            });
            if (ungrouped) {
                HistoryManager.save();
                CanvasEngine.draw();
                alert("그룹화가 해제되었습니다.");
            } else {
                alert("그룹에 속한 요소를 선택해주세요.");
            }
        };

        // Right panel buttons
        const btnGroup = document.getElementById('btn-group-action');
        if (btnGroup) btnGroup.onclick = performGroup;
        const btnUngroup = document.getElementById('btn-ungroup-action');
        if (btnUngroup) btnUngroup.onclick = performUngroup;

        // Floating fast actions toolbar button
        const ftGroup = document.getElementById('ft-group');
        if (ftGroup) {
            ftGroup.onclick = () => {
                const selectedEls = AppState.getSelectedEls();
                const hasGroup = selectedEls.some(el => el.groupId);
                if (AppState.selectedIds.length > 1) {
                    performGroup();
                } else if (AppState.selectedIds.length === 1 && hasGroup) {
                    const targetGroup = selectedEls[0].groupId;
                    const elsObj = AppState.getEls();
                    Object.keys(elsObj).forEach(id => {
                        if (elsObj[id].groupId === targetGroup) {
                            delete elsObj[id].groupId;
                        }
                    });
                    HistoryManager.save();
                    CanvasEngine.draw();
                    alert("그룹화가 해제되었습니다!");
                } else {
                    alert("그룹화하려면 2개 이상의 요소를 선택해야 합니다.");
                }
            };
        }
    },

    focusActivePage: function () {
        const workspace = document.getElementById('canvas-scroll-area');
        const canvas = CanvasEngine.canvas;
        if (!workspace || !canvas) return;

        // `scrollIntoView` is unreliable here because the canvas lives in a
        // transformed (zoomed) continuous-page wrapper.  Scroll the actual
        // editor viewport to the canvas' rendered position instead.
        const moveToCanvas = () => {
            const workspaceRect = workspace.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const nextTop = workspace.scrollTop
                + (canvasRect.top - workspaceRect.top)
                - ((workspace.clientHeight - canvasRect.height) / 2);
            const nextLeft = workspace.scrollLeft
                + (canvasRect.left - workspaceRect.left)
                - ((workspace.clientWidth - canvasRect.width) / 2);

            workspace.scrollTo({
                top: Math.max(0, nextTop),
                left: Math.max(0, nextLeft),
                behavior: 'auto'
            });
        };

        // Preview DOM and the zoom transform are both updated in the current
        // frame.  Wait for their layout, then run once more to cover images
        // that finish sizing a frame later.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                moveToCanvas();
                this.syncCanvasOverlayScale();
                requestAnimationFrame(moveToCanvas);
            });
        });
    },

    switchPage: function (index) {
        if (index < 0 || index >= AppState.pages.length) return false;
        if (index === AppState.currentIdx) {
            this.zoomToFit();
            this.refreshPageNavigationStatus();
            this.focusActivePage();
            return true;
        }
        AppState.currentIdx = index;
        AppState.selectedIds = [];
        AppState.editingCell = null;
        CanvasEngine.draw();
        this.renderContinuousPagePreviews(true);
        this.zoomToFit();
        this.refreshPageNavigationStatus();
        this.focusActivePage();
        return true;
    },

    bindPageWheelNavigation: function () {
        const workspace = document.getElementById('canvas-scroll-area');
        if (!workspace) return;
        let lastSwitch = 0;
        let overlayFrame = 0;
        workspace.addEventListener('scroll', () => {
            if (overlayFrame) return;
            overlayFrame = requestAnimationFrame(() => {
                overlayFrame = 0;
                this.syncCanvasOverlayScale();
            });
        }, { passive: true });
        workspace.addEventListener('wheel', event => {
            if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) < 14) return;
            const now = Date.now();
            const atTop = workspace.scrollTop <= 2;
            const atBottom = workspace.scrollTop + workspace.clientHeight >= workspace.scrollHeight - 2;
            const forward = event.deltaY > 0 && atBottom && AppState.currentIdx < AppState.pages.length - 1;
            const backward = event.deltaY < 0 && atTop && AppState.currentIdx > 0;
            if ((forward || backward) && now - lastSwitch > 450) {
                event.preventDefault(); lastSwitch = now;
                this.switchPage(AppState.currentIdx + (forward ? 1 : -1));
            }
        }, { passive: false });
    },

    bindSidePageControls: function () {
        const addPage = document.getElementById('side-add-page');
        const listAddPage = document.getElementById('page-add-button');
        const dupPage = document.getElementById('side-dup-page');
        const pageUp = document.getElementById('side-page-up');
        const pageDown = document.getElementById('side-page-down');
        const delPage = document.getElementById('side-del-page');
        const previousPage = document.getElementById('page-prev');
        const nextPage = document.getElementById('page-next');

        if (previousPage) previousPage.onclick = () => this.switchPage(AppState.currentIdx - 1);
        if (nextPage) nextPage.onclick = () => this.switchPage(AppState.currentIdx + 1);

        const createPage = () => {
                const newId = 'page_' + Math.random().toString(36).substring(2, 9);
                const page = AppState.getPage();
                AppState.pages.splice(AppState.currentIdx + 1, 0, {
                    id: newId,
                    title: '슬라이드 ' + (AppState.pages.length + 1),
                    w: page ? page.w : 1080,
                    h: page ? page.h : 1080,
                    bgType: 'solid',
                    bgColor: '#ffffff',
                    els: {}
                });
                AppState.currentIdx += 1;
                AppState.selectedIds = [];
                HistoryManager.save();
                CanvasEngine.draw();
                this.renderContinuousPagePreviews(true);
                this.zoomToFit();
                this.focusActivePage();
        };
        [addPage, listAddPage].filter(Boolean).forEach(button => { button.onclick = event => { event.preventDefault(); event.stopPropagation(); createPage(); }; });

        if (dupPage) {
            dupPage.onclick = () => {
                const page = AppState.getPage();
                if (!page) return;
                const newId = 'page_' + Math.random().toString(36).substring(2, 9);
                
                const clonedEls = JSON.parse(JSON.stringify(page.els));
                const finalEls = {};
                Object.keys(clonedEls).forEach(oldKey => {
                    const el = clonedEls[oldKey];
                    const newKey = el.type + '_' + Math.random().toString(36).substring(2, 9);
                    finalEls[newKey] = el;
                });

                AppState.pages.splice(AppState.currentIdx + 1, 0, {
                    ...JSON.parse(JSON.stringify(page)),
                    id: newId,
                    title: page.title + ' (사본)',
                    els: finalEls
                });
                AppState.currentIdx += 1;
                AppState.selectedIds = [];
                HistoryManager.save();
                CanvasEngine.draw();
                this.renderContinuousPagePreviews(true);
                this.zoomToFit();
                this.focusActivePage();
            };
        }

        if (pageUp) {
            pageUp.onclick = () => {
                if (AppState.currentIdx > 0) {
                    const temp = AppState.pages[AppState.currentIdx];
                    AppState.pages[AppState.currentIdx] = AppState.pages[AppState.currentIdx - 1];
                    AppState.pages[AppState.currentIdx - 1] = temp;
                    AppState.currentIdx -= 1;
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        if (pageDown) {
            pageDown.onclick = () => {
                if (AppState.currentIdx < AppState.pages.length - 1) {
                    const temp = AppState.pages[AppState.currentIdx];
                    AppState.pages[AppState.currentIdx] = AppState.pages[AppState.currentIdx + 1];
                    AppState.pages[AppState.currentIdx + 1] = temp;
                    AppState.currentIdx += 1;
                    HistoryManager.save();
                    CanvasEngine.draw();
                }
            };
        }

        if (delPage) {
            delPage.onclick = () => {
                if (AppState.pages.length > 1) {
                    AppState.pages.splice(AppState.currentIdx, 1);
                    AppState.currentIdx = Math.max(0, AppState.currentIdx - 1);
                    AppState.selectedIds = [];
                    HistoryManager.save();
                    CanvasEngine.draw();
                    this.zoomToFit();
                } else {
                    alert("최소 1개의 슬라이드가 존재해야 합니다.");
                }
            };
        }
    }
};
