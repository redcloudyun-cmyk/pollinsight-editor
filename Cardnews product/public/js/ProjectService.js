import { AppState } from './AppState.js';
import { CanvasEngine } from './CanvasEngine.js';

export const ProjectService = {
    draftKey: 'pollinsight-design-draft-v1',
    lastDraft: '',
    currentProjectId: null,
    currentFolderId: null,

    projectPayload: function () {
        return {
            version: 1,
            title: document.getElementById('project-title')?.value || 'untitled-design',
            // Canvas image instances and calculated bounds are runtime-only values.
            pages: JSON.parse(JSON.stringify(AppState.pages, (key, value) => {
                if (key === 'img' || key.startsWith('_')) return undefined;
                return value;
            })),
            currentIdx: AppState.currentIdx,
            savedAt: new Date().toISOString()
        };
    },

    hydrateImages: function () {
        Object.values(AppState.pages).forEach(page => {
            Object.values(page.els || {}).forEach(el => {
                if (el.type === 'image' && el.imgSrc) {
                    const img = new Image();
                    img.src = el.imgSrc;
                    el.img = img;
                }
            });
            if (page.bgType === 'image' && page.bgImageSrc) {
                const image = new Image();
                image.src = page.bgImageSrc;
                page._bgImage = image;
            }
        });
    },

    applyProject: function (project) {
        if (!project || !Array.isArray(project.pages) || project.pages.length === 0) {
            throw new Error('유효한 디자인 파일이 아닙니다.');
        }
        AppState.pages = project.pages;
        AppState.currentIdx = Math.min(Math.max(Number(project.currentIdx) || 0, 0), AppState.pages.length - 1);
        AppState.selectedIds = [];
        AppState.editingId = null;
        this.hydrateImages();
        const title = document.getElementById('project-title');
        if (title && project.title) title.value = project.title;
        this.currentProjectId = project.id ? Number(project.id) : this.currentProjectId;
        this.currentFolderId = project.folder_id ? Number(project.folder_id) : null;
        this.saveDraft();
    },

    newProject: function () {
        this.currentProjectId = null;
        this.currentFolderId = null;
        this.applyProject({ title: '새 디자인', currentIdx: 0, pages: [{
            id: 'page_' + Date.now(), title: '페이지 1', w: 1080, h: 1080,
            bgType: 'solid', bgColor: '#ffffff', bgColor2: '#eff6ff', bgGradientAngle: 180,
            bgStrokeWidth: 0, bgStrokeColor: '#000000', els: {}
        }] });
    },

    saveDraft: function () {
        try {
            const content = JSON.stringify(this.projectPayload());
            localStorage.setItem(this.draftKey, content);
            this.lastDraft = content;
        } catch (error) {
            console.warn('임시저장에 실패했습니다.', error);
        }
    },

    restoreDraft: function () {
        try {
            const raw = localStorage.getItem(this.draftKey);
            if (!raw) return false;
            this.applyProject(JSON.parse(raw));
            this.lastDraft = raw;
            return true;
        } catch (error) {
            console.warn('임시저장을 복원하지 못했습니다.', error);
            return false;
        }
    },

    enableAutoSave: function () {
        window.setInterval(() => {
            const current = JSON.stringify(this.projectPayload());
            if (current !== this.lastDraft) this.saveDraft();
        }, 2000);
        window.addEventListener('beforeunload', () => this.saveDraft());
    },

    downloadProject: function (title) {
        const data = JSON.stringify(this.projectPayload(), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${(title || 'untitled-design').replace(/[\\/:*?"<>|]/g, '_')}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.saveDraft();
    },

    importProject: function (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
            reader.onload = () => {
                try {
                    this.applyProject(JSON.parse(reader.result));
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsText(file, 'utf-8');
        });
    },
    saveToDB: async function (title) {
        try {
            const payload = this.projectPayload();
            CanvasEngine.draw(true);
            const previewData = CanvasEngine.canvas.toDataURL('image/jpeg', 0.72);
            CanvasEngine.draw();
            const candidateName = "Campaign";
            const apiBase = window.location.port === '3000' ? '' : 'http://localhost:3000';
            const response = await fetch(`${apiBase}/api/projects/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: this.currentProjectId, folder_id: this.currentFolderId, title, candidate_name: candidateName, design_state: payload, preview_data: previewData })
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && result.projectId) this.currentProjectId = Number(result.projectId);
            return result;
        } catch (e) {
            console.error(e);
            return { success: false, message: e.message };
        }
    },

    loadServerProject: async function (id) {
        const apiBase = window.location.port === '3000' ? '' : 'http://localhost:3000';
        const response = await fetch(`${apiBase}/api/projects/${id}`, { credentials: 'include' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || '프로젝트를 불러올 수 없습니다.');
        const state = typeof result.project.design_state === 'string' ? JSON.parse(result.project.design_state) : result.project.design_state;
        this.currentProjectId = Number(result.project.id);
        this.currentFolderId = result.project.folder_id ? Number(result.project.folder_id) : null;
        this.applyProject({ ...state, id: result.project.id, folder_id: result.project.folder_id, title: result.project.title });
        return result.project;
    },

    downloadPNG: function (title) {
        CanvasEngine.draw(true);
        const link = document.createElement('a');
        link.download = `${title || 'project'}.png`;
        link.href = CanvasEngine.canvas.toDataURL('image/png');
        link.click();
        CanvasEngine.draw();
    },

    downloadJPG: function (title) {
        CanvasEngine.draw(true);
        const link = document.createElement('a');
        link.download = `${title || 'project'}.jpg`;
        link.href = CanvasEngine.canvas.toDataURL('image/jpeg', 0.9);
        link.click();
        CanvasEngine.draw();
    },

    downloadPDF: async function (title) {
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) {
            alert("PDF export library not loaded. Check script tag.");
            return;
        }

        const originalIdx = AppState.currentIdx;
        const originalSelection = [...AppState.selectedIds];
        AppState.selectedIds = []; // clear highlight

        const firstPage = AppState.pages[0];
        const pdf = new jsPDF({
            orientation: firstPage.w >= firstPage.h ? 'l' : 'p',
            unit: 'px',
            format: [firstPage.w, firstPage.h]
        });

        for (let i = 0; i < AppState.pages.length; i++) {
            AppState.currentIdx = i;
            CanvasEngine.draw(true);
            await new Promise(resolve => setTimeout(resolve, 60)); // ensure draw completes
            const imgData = CanvasEngine.canvas.toDataURL('image/png');
            if (i > 0) {
                const p = AppState.pages[i];
                pdf.addPage([p.w, p.h], p.w >= p.h ? 'l' : 'p');
            }
            pdf.addImage(imgData, 'PNG', 0, 0, AppState.pages[i].w, AppState.pages[i].h);
        }

        pdf.save(`${title || 'project'}.pdf`);

        // restore state
        AppState.currentIdx = originalIdx;
        AppState.selectedIds = originalSelection;
        CanvasEngine.draw();
    },

    downloadPPTX: async function (title) {
        if (!window.PptxGenJS) {
            alert("PPTX library not loaded. Check script tag.");
            return;
        }

        const pptx = new window.PptxGenJS();
        const firstPage = AppState.pages[0];
        const aspect = firstPage.w / firstPage.h;

        if (Math.abs(aspect - 1.777) < 0.1) {
            pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 5.625 });
        } else if (Math.abs(aspect - 1.0) < 0.1) {
            pptx.defineLayout({ name: 'CUSTOM', width: 8.5, height: 8.5 });
        } else {
            pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 10 / aspect });
        }
        pptx.layout = 'CUSTOM';

        AppState.pages.forEach(page => {
            const slide = pptx.addSlide();
            if (page.bgType === 'solid') {
                slide.background = { fill: (page.bgColor || '#ffffff').replace('#', '') };
            } else {
                slide.background = { fill: (page.bgColor || '#ffffff').replace('#', '') };
            }

            const els = page.els;
            Object.keys(els).forEach(key => {
                const el = els[key];
                if (el.hidden) return;

                const sW = pptx.width;
                const sH = pptx.height;
                const x = (el.x / page.w) * sW;
                const y = (el.y / page.h) * sH;
                const w = ((el.w || 200) / page.w) * sW;
                const h = ((el.h || 100) / page.h) * sH;

                if (el.type === 'text') {
                    let align = 'left';
                    if (el.align === 'center') align = 'center';
                    if (el.align === 'right') align = 'right';

                    slide.addText(el.text, {
                        x: x - (el.align === 'center' ? w / 2 : (el.align === 'right' ? w : 0)),
                        y: y,
                        w: w || 3.0,
                        h: h || 1.0,
                        color: (el.color || '#000000').replace('#', ''),
                        fontSize: Math.round(el.size * 0.75),
                        fontFace: el.font || 'Arial',
                        bold: !!el.bold,
                        italic: !!el.italic,
                        underline: !!el.underline,
                        align: align,
                        valign: 'top',
                        margin: 0
                    });
                } else if (el.type === 'rect') {
                    slide.addShape(pptx.shapes.RECTANGLE, {
                        x: x, y: y, w: w, h: h,
                        fill: { color: (el.color || '#3b82f6').replace('#', '') }
                    });
                } else if (el.type === 'circle') {
                    slide.addShape(pptx.shapes.OVAL, {
                        x: x, y: y, w: w, h: h,
                        fill: { color: (el.color || '#3b82f6').replace('#', '') }
                    });
                } else if (el.type === 'image' && el.imgSrc) {
                    slide.addImage({
                        data: el.imgSrc,
                        x: x, y: y, w: w, h: h
                    });
                }
            });
        });

        pptx.writeFile({ fileName: `${title || 'project'}.pptx` });
    }
};
