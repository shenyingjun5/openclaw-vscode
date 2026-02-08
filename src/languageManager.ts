import * as vscode from 'vscode';

/**
 * 语言管理器 - 管理 UI 和 AI 输出语言
 */
export class LanguageManager {
    private static instance: LanguageManager;
    private currentLocale: string;
    private aiOutputLanguage: string;

    private constructor() {
        this.currentLocale = this.detectSystemLocale();
        this.aiOutputLanguage = this.loadAiOutputLanguage();

        // 监听配置变化
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('openclaw.aiOutputLanguage')) {
                this.aiOutputLanguage = this.loadAiOutputLanguage();
            }
        });
    }

    public static getInstance(): LanguageManager {
        if (!LanguageManager.instance) {
            LanguageManager.instance = new LanguageManager();
        }
        return LanguageManager.instance;
    }

    /**
     * 检测系统语言
     */
    private detectSystemLocale(): string {
        const vscodeLang = vscode.env.language; // "zh-cn", "en", "ja", etc.
        return this.normalizeLocale(vscodeLang);
    }

    /**
     * 规范化语言代码
     */
    private normalizeLocale(locale: string): string {
        const normalized = locale.toLowerCase();
        
        // 映射到标准格式
        const localeMap: { [key: string]: string } = {
            'zh-cn': 'zh-CN',
            'zh-tw': 'zh-TW',
            'en': 'en',
            'en-us': 'en',
            'ja': 'ja',
            'ko': 'ko'
        };

        return localeMap[normalized] || 'en';
    }

    /**
     * 加载 AI 输出语言设置
     */
    private loadAiOutputLanguage(): string {
        const config = vscode.workspace.getConfiguration('openclaw');
        const setting = config.get<string>('aiOutputLanguage', 'auto');

        if (setting === 'auto') {
            return this.currentLocale;
        }

        return setting;
    }

    /**
     * 获取 UI 语言（用于 webview 本地化）
     */
    public getUILocale(): string {
        return this.currentLocale;
    }

    /**
     * 获取 AI 输出语言
     */
    public getAIOutputLanguage(): string {
        return this.aiOutputLanguage;
    }

    /**
     * 生成 AI 语言指令（添加到 system prompt）
     */
    public getLanguageInstruction(): string {
        const lang = this.aiOutputLanguage;

        const langNames: { [key: string]: string } = {
            'zh-CN': 'Chinese (Simplified)',
            'zh-TW': 'Chinese (Traditional)',
            'en': 'English',
            'ja': 'Japanese',
            'ko': 'Korean'
        };

        // 英文是默认，不需要额外指令
        // if (lang === 'en') {
        //     return '';
        // }

        const langName = langNames[lang] || lang;
        return `Please respond in ${langName} unless the user explicitly requests a different language.`;
    }

    /**
     * 获取语言显示名称
     */
    public getLanguageDisplayName(locale?: string): string {
        const lang = locale || this.aiOutputLanguage;

        const displayNames: { [key: string]: string } = {
            'zh-CN': '简体中文',
            'zh-TW': '繁體中文',
            'en': 'English',
            'ja': '日本語',
            'ko': '한국어'
        };

        return displayNames[lang] || lang;
    }
}
