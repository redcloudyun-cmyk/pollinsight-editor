export const AppState = {
    pages: [
        {
            id: 'page_1',
            title: '슬라이드 1',
            w: 1080,
            h: 1080,
            bgType: 'solid', // solid, gradient, image
            bgColor: '#ffffff',
            bgColor2: '#eff6ff',
            bgGradientAngle: 180,
            bgStrokeWidth: 0,
            bgStrokeColor: '#000000',
            els: {}
        }
    ],
    currentIdx: 0,
    selectedIds: [],
    zoom: 1.0,
    guideLines: [], // { type: 'h'|'v', val: px }
    editingId: null, // active text editor id
    editingCell: null, // active table cell: { id, r, c }
    copyBuffer: null, // array of cloned elements
    showGrid: false,
    snapEnabled: true,
    marquee: { x: 0, y: 0, w: 0, h: 0, active: false },
    
    getPage() {
        return this.pages[this.currentIdx];
    },
    
    getEls() {
        const p = this.getPage();
        return p ? p.els : {};
    },
    
    getSelectedEls() {
        const els = this.getEls();
        return this.selectedIds.map(id => els[id]).filter(Boolean);
    }
};
