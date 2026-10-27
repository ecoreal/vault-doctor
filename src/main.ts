// Vault Doctor — health checks for your Obsidian vault.
// Broken links, orphan notes, stubs, oversized attachments, frontmatter
// lint, duplicate names, unsafe file names — with one-click fixes.

import { EventRef, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { analyze } from './engine';
import { collectSnapshot } from './collect';
import { attachSuggestions, relinkContent } from './fixes';
import { missingParents } from './pathutil';
import { generateReport } from './report';
import { DEFAULT_SETTINGS, VaultDoctorSettingTab, VaultDoctorSettings } from './settings';
import { ScanResult } from './types';
import { VIEW_TYPE_VAULT_DOCTOR, VaultDoctorView } from './view';

export default class VaultDoctorPlugin extends Plugin {
	settings!: VaultDoctorSettings;
	lastResult: ScanResult | null = null;
	scanning = false;
	private statusEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_VAULT_DOCTOR, (leaf: WorkspaceLeaf) => new VaultDoctorView(leaf, this));

		this.addRibbonIcon('stethoscope', 'Vault Doctor: scan vault', () => void this.runScan());

		this.statusEl = this.addStatusBarItem();
		this.statusEl.setText('🩺 VD ready');
		this.statusEl.addClass('mod-clickable');
		this.statusEl.addEventListener('click', () => void this.activateView());

		this.addCommand({
			id: 'run-scan',
			name: 'Scan vault now',
			callback: () => void this.runScan(),
		});
		this.addCommand({
			id: 'export-report',
			name: 'Export report as note',
			callback: () => void this.exportReport(),
		});

		this.addSettingTab(new VaultDoctorSettingTab(this.app, this));
	}

	onunload(): void {
		this.statusEl?.remove();
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_DOCTOR)) {
			leaf.detach();
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async runScan(): Promise<void> {
		if (this.scanning) return;
		this.scanning = true;
		try {
			await this.activateView();
			const view = this.openView();
			view?.render();
			const snapshot = await collectSnapshot(this.app);
			const result = analyze(snapshot, this.settings);
			attachSuggestions(result, snapshot, this.settings);
			this.lastResult = result;
			const n = result.findings.length;
			this.statusEl?.setText(n > 0 ? `🩺 VD: ${n} issue${n === 1 ? '' : 's'}` : '🩺 VD: ✓ clean');
			new Notice(
				n > 0
					? `Vault Doctor: ${n} finding${n === 1 ? '' : 's'}`
					: 'Vault Doctor: all checks passed ✓',
			);
		} catch (err) {
			console.error('[vault-doctor] scan failed', err);
			new Notice(`Vault Doctor: scan failed — ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			this.scanning = false;
			this.openView()?.render();
		}
	}

	async applyFixes(findings: ScanResult['findings']): Promise<void> {
		let applied = 0;
		for (const finding of findings) {
			const fix = finding.fix;
			if (!fix) continue;
			try {
				if (fix.kind === 'relink') {
					const af = this.app.vault.getAbstractFileByPath(fix.file);
					if (!(af instanceof TFile)) continue;
					const kind = finding.link?.kind ?? 'wiki';
					await this.app.vault.process(af, (content) =>
						relinkContent(content, fix.from, fix.to, kind).content,
					);
					applied++;
				} else if (fix.kind === 'trash') {
					const af = this.app.vault.getAbstractFileByPath(fix.file);
					if (!(af instanceof TFile)) continue;
					await this.app.vault.trash(af, true);
					applied++;
				}
			} catch (err) {
				console.error('[vault-doctor] fix failed', fix, err);
				new Notice(`Vault Doctor: fix failed for ${fix.file}`);
			}
		}
		if (applied > 0) new Notice(`Vault Doctor: applied ${applied} fix${applied === 1 ? '' : 'es'} ✓`);
		await this.waitForMetadataSettle();
		await this.runScan();
	}

	/** Let Obsidian reindex files we just wrote before rescanning, or the
	 *  metadata cache still serves the pre-fix links. */
	private async waitForMetadataSettle(timeoutMs = 800): Promise<void> {
		await new Promise<void>((resolve) => {
			let done = false;
			let ref: EventRef | null = null;
			const finish = () => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				if (ref) this.app.metadataCache.offref(ref);
				resolve();
			};
			const timer = setTimeout(finish, timeoutMs);
			ref = this.app.metadataCache.on('resolved', finish);
			this.registerEvent(ref);
		});
	}

	async exportReport(): Promise<void> {
		if (!this.lastResult) await this.runScan();
		const result = this.lastResult;
		if (!result) return;
		const md = generateReport(result, {
			vaultName: this.app.vault.getName(),
			maxRowsPerSection: this.settings.maxReportRows,
		});
		const path = this.settings.reportPath;
		try {
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, md);
				await this.app.workspace.getLeaf('tab').openFile(existing);
			} else {
				for (const dir of missingParents(path,
					(d) => this.app.vault.getAbstractFileByPath(d) != null)) {
					await this.app.vault.createFolder(dir);
				}
				const file = await this.app.vault.create(path, md);
				await this.app.workspace.getLeaf('tab').openFile(file);
			}
		} catch (err) {
			console.error('[vault-doctor] report export failed', err);
			new Notice(`Vault Doctor: could not write ${path} — ${err instanceof Error ? err.message : String(err)}`);
			return;
		}
		new Notice(`Vault Doctor: report written to ${path}`);
	}

	private openView(): VaultDoctorView | null {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_DOCTOR);
		for (const leaf of leaves) {
			const v = leaf.view;
			if (v instanceof VaultDoctorView) return v;
		}
		return null;
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_VAULT_DOCTOR);
		let leaf: WorkspaceLeaf | null = null;
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE_VAULT_DOCTOR, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}
