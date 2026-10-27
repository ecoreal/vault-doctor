// Vault Doctor dashboard view (obsidian side).

import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import VaultDoctorPlugin from './main';
import { CATEGORY_LABEL, CATEGORY_ORDER, Category, Finding, ScanResult } from './types';
import { humanSize } from './engine';

export const VIEW_TYPE_VAULT_DOCTOR = 'vault-doctor-view';

export class VaultDoctorView extends ItemView {
	plugin: VaultDoctorPlugin;
	private collapsed = new Set<Category>();

	constructor(leaf: WorkspaceLeaf, plugin: VaultDoctorPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
	}

	getViewType(): string {
		return VIEW_TYPE_VAULT_DOCTOR;
	}

	getDisplayText(): string {
		return 'Vault Doctor';
	}

	getIcon(): string {
		return 'stethoscope';
	}

	async onOpen(): Promise<void> {
		this.render();
		if (!this.plugin.scanning) {
			await this.plugin.runScan();
		}
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('vault-doctor-view');

		const header = contentEl.createDiv({ cls: 'vd-header' });
		const title = header.createDiv({ cls: 'vd-title' });
		title.createSpan({ text: 'Vault Doctor', cls: 'vd-title-text' });
		const actions = header.createDiv({ cls: 'vd-actions' });
		actions
			.createEl('button', { text: 'Rescan', cls: 'mod-cta' })
			.addEventListener('click', () => void this.plugin.runScan());
		actions
			.createEl('button', { text: 'Export report' })
			.addEventListener('click', () => void this.plugin.exportReport());

		const result = this.plugin.lastResult;
		if (this.plugin.scanning) {
			contentEl.createDiv({ text: 'Scanning vault…', cls: 'vd-status' });
			return;
		}
		if (!result) {
			contentEl.createDiv({
				text: 'No scan yet. Click Rescan to check this vault.',
				cls: 'vd-status',
			});
			return;
		}

		this.renderChips(contentEl, result);
		this.renderSections(contentEl, result);
		this.renderStats(contentEl, result);
	}

	private renderChips(root: HTMLElement, result: ScanResult): void {
		const { findings, stats } = result;
		const chips = root.createDiv({ cls: 'vd-chips' });
		const errors = findings.filter((f) => f.severity === 'error').length;
		const warnings = findings.filter((f) => f.severity === 'warning').length;
		const infos = findings.filter((f) => f.severity === 'info').length;
		const chip = (cls: string, text: string) => chips.createSpan({ text, cls: `vd-chip ${cls}` });
		chip('vd-chip-ok', `${stats.notes} notes`);
		chip('vd-chip-ok', `${stats.links} links`);
		if (errors) chip('vd-chip-error', `${errors} errors`);
		if (warnings) chip('vd-chip-warning', `${warnings} warnings`);
		if (infos) chip('vd-chip-info', `${infos} suggestions`);
		if (!findings.length) chip('vd-chip-ok', '✓ all checks passed');
	}

	private renderSections(root: HTMLElement, result: ScanResult): void {
		const { findings } = result;
		const wrap = root.createDiv({ cls: 'vd-sections' });
		if (!findings.length) {
			wrap.createDiv({
				text: 'Your vault is healthy. Nothing broken, nothing missing.',
				cls: 'vd-allclear',
			});
			return;
		}
		for (const cat of CATEGORY_ORDER) {
			const items = findings.filter((f) => f.category === cat);
			if (!items.length) continue;
			this.renderSection(wrap, cat, items);
		}
	}

	private renderSection(wrap: HTMLElement, cat: Category, items: Finding[]): void {
		const isCollapsed = this.collapsed.has(cat);
		const section = wrap.createDiv({ cls: 'vd-section' });
		const head = section.createDiv({ cls: 'vd-section-head' });
		head.createSpan({
			text: `${isCollapsed ? '▸' : '▾'} ${CATEGORY_LABEL[cat]} (${items.length})`,
			cls: 'vd-section-title',
		});
		const fixable = items.filter((f) => f.fix?.kind === 'relink').length;
		if (fixable > 1 && !isCollapsed) {
			const btn = head.createEl('button', { text: `Fix all ${fixable} links`, cls: 'vd-fixall' });
			btn.addEventListener('click', () => void this.plugin.applyFixes(items.filter((f) => f.fix?.kind === 'relink')));
		}
		head.addEventListener('click', (ev) => {
			if ((ev.target as HTMLElement).tagName === 'BUTTON') return;
			if (isCollapsed) this.collapsed.delete(cat);
			else this.collapsed.add(cat);
			this.render();
		});
		if (isCollapsed) return;

		for (const f of items) this.renderRow(section, f);
	}

	private renderRow(section: HTMLElement, f: Finding): void {
		const row = section.createDiv({ cls: `vd-row vd-sev-${f.severity}` });
		const main = row.createDiv({ cls: 'vd-row-main' });
		main.createSpan({ text: f.message, cls: 'vd-row-msg' });
		const where = main.createSpan({
			text: f.link ? `${f.file}:${f.link.line + 1}` : f.file,
			cls: 'vd-row-file',
		});
		where.addEventListener('click', () => void this.openAt(f.file, f.link?.line ?? 0));
		if (f.detail && !f.detail.includes('\n')) {
			main.createSpan({ text: f.detail, cls: 'vd-row-detail' });
		}
		if (f.detail?.includes('\n')) {
			const det = row.createDiv({ cls: 'vd-row-list' });
			for (const line of f.detail.split('\n').slice(0, 20)) {
				det.createDiv({ text: line, cls: 'vd-row-list-item' });
			}
		}
		const bar = row.createDiv({ cls: 'vd-row-bar' });
		if (f.suggestion) {
			bar.createSpan({
				text: `did you mean [[${f.suggestion.target}]]?`,
				cls: 'vd-suggestion',
			});
		}
		if (f.fix?.kind === 'relink' && f.suggestion) {
			bar.createEl('button', { text: 'Apply fix' }).addEventListener('click', () =>
				void this.plugin.applyFixes([f]),
			);
		}
		if (f.fix?.kind === 'trash') {
			bar.createEl('button', { text: 'Move to trash' }).addEventListener('click', () =>
				void this.plugin.applyFixes([f]),
			);
		}
	}

	private renderStats(root: HTMLElement, result: ScanResult): void {
		const { stats } = result;
		const box = root.createDiv({ cls: 'vd-stats' });
		box.createDiv({ cls: 'vd-stats-title', text: 'Vault inventory' });
		const grid = box.createDiv({ cls: 'vd-stats-grid' });
		const item = (k: string, v: string) => {
			const d = grid.createDiv({ cls: 'vd-stat' });
			d.createSpan({ text: v, cls: 'vd-stat-value' });
			d.createSpan({ text: k, cls: 'vd-stat-key' });
		};
		item('notes', String(stats.notes));
		item('attachments', String(stats.attachments));
		item('vault size', humanSize(stats.totalSize));
		item('resolved links', `${stats.resolvedLinks}/${stats.links}`);
		const exts = Object.entries(stats.attachmentExt)
			.sort((a, b) => b[1].bytes - a[1].bytes)
			.slice(0, 6);
		for (const [ext, agg] of exts) {
			item(`.${ext}`, `${agg.count} · ${humanSize(agg.bytes)}`);
		}
	}

	private async openAt(path: string, line: number): Promise<void> {
		const af = this.app.vault.getAbstractFileByPath(path);
		if (af instanceof TFile) {
			await this.app.workspace.getLeaf('tab').openFile(af, { eState: { line } });
		} else {
			new Notice(`File not found: ${path}`);
		}
	}
}
