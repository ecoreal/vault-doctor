// Settings + settings tab (obsidian side).

import { App, PluginSettingTab, Setting } from 'obsidian';
import { EngineOptions } from './types';
import VaultDoctorPlugin from './main';

export interface VaultDoctorSettings extends EngineOptions {
	/** Where exported reports are written, vault-relative */
	reportPath: string;
	maxReportRows: number;
}

export const DEFAULT_SETTINGS: VaultDoctorSettings = {
	stubThresholdChars: 80,
	oversizeThresholdMB: 10,
	ignoreGlobs: [],
	ignoreRegexes: [],
	requireFrontmatterKeys: [],
	checkOrphans: true,
	checkDuplicates: true,
	checkUnsafeNames: true,
	checkHeadingLinks: true,
	checkStubs: true,
	checkOversize: true,
	treatTaggedAsLinked: true,
	maxSuggestDistance: 3,
	reportPath: 'Vault Doctor Report.md',
	maxReportRows: 200,
};

export class VaultDoctorSettingTab extends PluginSettingTab {
	plugin: VaultDoctorPlugin;

	constructor(app: App, plugin: VaultDoctorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Checks').setHeading();

		new Setting(containerEl)
			.setName('Detect orphan notes')
			.setDesc('Notes with no resolved inbound or outbound links.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.checkOrphans).onChange(async (v) => {
					this.plugin.settings.checkOrphans = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Tags count as references')
			.setDesc('Notes with tags are not reported as orphans.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.treatTaggedAsLinked).onChange(async (v) => {
					this.plugin.settings.treatTaggedAsLinked = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Detect duplicate note names')
			.setDesc('Notes in different folders sharing one name make [[name]] links ambiguous.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.checkDuplicates).onChange(async (v) => {
					this.plugin.settings.checkDuplicates = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Detect unsafe file names')
			.setDesc('Characters that break wiki links or are invalid on Windows/sync targets.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.checkUnsafeNames).onChange(async (v) => {
					this.plugin.settings.checkUnsafeNames = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Verify heading links')
			.setDesc('Check that [[note#heading]] targets exist.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.checkHeadingLinks).onChange(async (v) => {
					this.plugin.settings.checkHeadingLinks = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Detect stub notes')
			.setDesc('Nearly empty notes below the stub threshold; empty ones also get a trash fix.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.checkStubs).onChange(async (v) => {
					this.plugin.settings.checkStubs = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Detect oversized attachments')
			.setDesc('Attachments above the size threshold; the attachment inventory is unaffected.')
			.addToggle((t) =>
				t.setValue(this.plugin.settings.checkOversize).onChange(async (v) => {
					this.plugin.settings.checkOversize = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('Thresholds').setHeading();

		new Setting(containerEl)
			.setName('Stub threshold (characters)')
			.setDesc('Notes with less body text than this are flagged as stubs.')
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.stubThresholdChars))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!Number.isNaN(n) && n >= 0) {
							this.plugin.settings.stubThresholdChars = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName('Oversized attachment threshold (MB)')
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.oversizeThresholdMB))
					.onChange(async (v) => {
						const n = parseFloat(v);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.oversizeThresholdMB = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName('Suggestion distance')
			.setDesc('Max edit distance for "did you mean" link suggestions (0–8).')
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.maxSuggestDistance))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!Number.isNaN(n) && n >= 0 && n <= 8) {
							this.plugin.settings.maxSuggestDistance = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl).setName('Scope').setHeading();

		new Setting(containerEl)
			.setName('Ignored paths (globs)')
			.setDesc('One pattern per line. Supports **, * and !negation. Example: Templates/**')
			.addTextArea((t) =>
				t
					.setValue(this.plugin.settings.ignoreGlobs.join('\n'))
					.setPlaceholder('Templates/**\nArchive/**')
					.onChange(async (v) => {
						this.plugin.settings.ignoreGlobs = v
							.split('\n')
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Ignored paths (regex)')
			.setDesc('One regular expression per line, matched case-insensitively against vault paths.')
			.addTextArea((t) =>
				t
					.setValue(this.plugin.settings.ignoreRegexes.join('\n'))
					.setPlaceholder('^Journal/2023/')
					.onChange(async (v) => {
						this.plugin.settings.ignoreRegexes = v
							.split('\n')
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Required frontmatter keys')
			.setDesc('Comma-separated. Notes that carry frontmatter must contain these keys.')
			.addText((t) =>
				t
					.setValue(this.plugin.settings.requireFrontmatterKeys.join(', '))
					.setPlaceholder('tags, created')
					.onChange(async (v) => {
						this.plugin.settings.requireFrontmatterKeys = v
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('Report').setHeading();

		new Setting(containerEl)
			.setName('Report file path')
			.setDesc('Where the "Export report" command writes the markdown report.')
			.addText((t) =>
				t.setValue(this.plugin.settings.reportPath).onChange(async (v) => {
					this.plugin.settings.reportPath = v.trim() || DEFAULT_SETTINGS.reportPath;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Max rows per report section')
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.maxReportRows))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						if (!Number.isNaN(n) && n > 0) {
							this.plugin.settings.maxReportRows = n;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
