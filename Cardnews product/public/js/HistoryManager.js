import { AppState } from './AppState.js';

export const HistoryManager = {
    stack: [],
    index: -1,

    save: function () {
        // deep copy AppState.pages
        const state = JSON.stringify(AppState.pages);
        if (this.index >= 0 && this.stack[this.index] === state) return;

        this.stack = this.stack.slice(0, this.index + 1);
        this.stack.push(state);
        this.index++;
    },

    undo: function () {
        if (this.index > 0) {
            this.index--;
            AppState.pages = JSON.parse(this.stack[this.index]);
            if (AppState.currentIdx >= AppState.pages.length) {
                AppState.currentIdx = AppState.pages.length - 1;
            }
            AppState.selectedIds = [];
            AppState.editingId = null;
            return true;
        }
        return false;
    },

    redo: function () {
        if (this.index < this.stack.length - 1) {
            this.index++;
            AppState.pages = JSON.parse(this.stack[this.index]);
            if (AppState.currentIdx >= AppState.pages.length) {
                AppState.currentIdx = AppState.pages.length - 1;
            }
            AppState.selectedIds = [];
            AppState.editingId = null;
            return true;
        }
        return false;
    }
};