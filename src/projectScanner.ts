import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ProjectSkill {
    name: string;
    triggers: string[];
    content: string;
    filePath: string;
    priority: number;
    autoTrigger: boolean;
    category?: string;
}

export interface ProjectWorkflow {
    name: string;
    content: string;
    filePath: string;
    relativePath: string;
    category?: string;
}

export interface ProjectConfig {
    workspaceDir: string;
    skills: ProjectSkill[];
    workflows: ProjectWorkflow[];
    initialized: boolean;
    lastScan: number;
    configSource: string[];
}

// Simple frontmatter parser
function parseFrontmatter(content: string): { data: Record<string, any>; content: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
        return { data: {}, content };
    }
    
    const frontmatter = match[1];
    const body = match[2];
    const data: Record<string, any> = {};
    
    // Parse YAML-like frontmatter
    const lines = frontmatter.split('\n');
    let currentKey = '';
    let inArray = false;
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        if (trimmed.startsWith('- ')) {
            // Array item
            if (currentKey && inArray) {
                if (!Array.isArray(data[currentKey])) {
                    data[currentKey] = [];
                }
                data[currentKey].push(trimmed.slice(2).trim());
            }
        } else if (trimmed.includes(':')) {
            const colonIdx = trimmed.indexOf(':');
            const key = trimmed.slice(0, colonIdx).trim();
            const value = trimmed.slice(colonIdx + 1).trim();
            currentKey = key;
            
            if (value === '') {
                // Start of array
                inArray = true;
                data[key] = [];
            } else {
                inArray = false;
                // Parse value
                if (value === 'true') {
                    data[key] = true;
                } else if (value === 'false') {
                    data[key] = false;
                } else if (/^\d+$/.test(value)) {
                    data[key] = parseInt(value, 10);
                } else {
                    data[key] = value.replace(/^["']|["']$/g, '');
                }
            }
        }
    }
    
    return { data, content: body };
}

export class ProjectScanner {
    private static EXCLUDE_DIRS = [
        'node_modules',
        '.git',
        '.vscode',
        'dist',
        'build',
        'out',
        'target',
        '.next',
        '.nuxt',
        '__pycache__',
        'venv',
        '.venv',
        'vendor',
        'coverage',
        '.cache',
    ];
    
    private static MAX_DEPTH = 10;

    async scan(workspaceDir: string): Promise<ProjectConfig> {
        const skills: ProjectSkill[] = [];
        const workflows: ProjectWorkflow[] = [];
        const configSource: string[] = [];

        // Scan skills (recursively find all skills/ directories)
        await this.scanSkillsRecursive(workspaceDir, skills, configSource);

        // Scan workflows (recursively find all workflows/ directories)
        await this.scanWorkflowsRecursive(workspaceDir, workflows, configSource);

        return {
            workspaceDir,
            skills,
            workflows,
            initialized: true,
            lastScan: Date.now(),
            configSource,
        };
    }

    /**
     * Recursively scan for skills/ directories
     */
    private async scanSkillsRecursive(
        dir: string,
        skills: ProjectSkill[],
        configSource: string[],
        depth = 0,
        workspaceDir?: string
    ) {
        if (depth > ProjectScanner.MAX_DEPTH) {
            return;
        }

        if (!workspaceDir) {
            workspaceDir = dir;
        }

        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                // Skip excluded directories
                if (ProjectScanner.EXCLUDE_DIRS.includes(entry.name)) {
                    continue;
                }

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Check if this is a skills directory (case-insensitive)
                    if (entry.name.toLowerCase() === 'skills') {
                        // Scan one-level subdirectories for skill.md
                        await this.scanSkillsInDirectory(fullPath, skills, configSource, workspaceDir);
                    } else {
                        // Recursively scan subdirectories to find more skills/ dirs
                        await this.scanSkillsRecursive(fullPath, skills, configSource, depth + 1, workspaceDir);
                    }
                }
            }
        } catch (e) {
            // Ignore read errors
        }
    }

    /**
     * Scan skills in a skills/ directory (one level deep only)
     */
    private async scanSkillsInDirectory(
        skillsDir: string,
        skills: ProjectSkill[],
        configSource: string[],
        workspaceDir: string
    ) {
        try {
            const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const subDirPath = path.join(skillsDir, entry.name);
                    const skillFilePath = path.join(subDirPath, 'skill.md');

                    if (await this.exists(skillFilePath)) {
                        const relativePath = path.relative(workspaceDir, skillsDir);
                        const category = relativePath || 'root';
                        
                        const skill = await this.parseSkillFile(skillFilePath, entry.name, category);
                        if (skill) {
                            skills.push(skill);
                            const relativeSkillPath = path.relative(workspaceDir, skillFilePath);
                            configSource.push(relativeSkillPath);
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore read errors
        }
    }

    /**
     * Recursively scan for workflows/ directories
     */
    private async scanWorkflowsRecursive(
        dir: string,
        workflows: ProjectWorkflow[],
        configSource: string[],
        depth = 0,
        workspaceDir?: string
    ) {
        if (depth > ProjectScanner.MAX_DEPTH) {
            return;
        }

        if (!workspaceDir) {
            workspaceDir = dir;
        }

        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                // Skip excluded directories
                if (ProjectScanner.EXCLUDE_DIRS.includes(entry.name)) {
                    continue;
                }

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Check if this is a workflows directory (case-insensitive)
                    if (entry.name.toLowerCase() === 'workflows') {
                        // Read all .md files in this workflows directory
                        await this.scanWorkflowFiles(fullPath, workflows, configSource, workspaceDir);
                    } else {
                        // Recursively scan subdirectories
                        await this.scanWorkflowsRecursive(fullPath, workflows, configSource, depth + 1, workspaceDir);
                    }
                }
            }
        } catch (e) {
            // Ignore read errors
        }
    }

    /**
     * Scan .md files in a workflows directory
     */
    private async scanWorkflowFiles(
        workflowsDir: string,
        workflows: ProjectWorkflow[],
        configSource: string[],
        workspaceDir: string
    ) {
        try {
            const entries = await fs.promises.readdir(workflowsDir, { withFileTypes: true });
            const relativeDirPath = path.relative(workspaceDir, workflowsDir);

            for (const entry of entries) {
                if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
                    const filePath = path.join(workflowsDir, entry.name);
                    try {
                        const content = await fs.promises.readFile(filePath, 'utf8');
                        const name = path.basename(entry.name, '.md');
                        const relativePath = path.relative(workspaceDir, filePath);
                        
                        workflows.push({
                            name,
                            content: content.trim(),
                            filePath,
                            relativePath,
                            category: relativeDirPath
                        });
                        
                        configSource.push(relativePath);
                    } catch (e) {
                        // Ignore read errors
                    }
                }
            }
        } catch (e) {
            // Ignore read errors
        }
    }

    private async exists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private async parseSkillFile(filePath: string, dirName: string, category: string): Promise<ProjectSkill | null> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const { data: frontmatter, content: body } = parseFrontmatter(content);
            
            // Use directory name as default skill name
            const skillName = frontmatter.name || dirName;
            
            return {
                name: skillName,
                triggers: frontmatter.triggers || [skillName],
                content: body.trim(),
                filePath,
                priority: frontmatter.priority || 0,
                autoTrigger: frontmatter.autoTrigger !== false,
                category
            };
        } catch (e) {
            return null;
        }
    }
}

// Cache per workspace
const projectCache = new Map<string, ProjectConfig>();

export async function getProjectConfig(workspaceDir: string, forceRescan = false): Promise<ProjectConfig> {
    const cached = projectCache.get(workspaceDir);
    
    // Return cached if valid and not forcing rescan
    if (cached && !forceRescan) {
        // Rescan if older than 5 minutes
        const age = Date.now() - cached.lastScan;
        if (age < 5 * 60 * 1000) {
            return cached;
        }
    }
    
    const scanner = new ProjectScanner();
    const config = await scanner.scan(workspaceDir);
    projectCache.set(workspaceDir, config);
    
    return config;
}

export function clearProjectCache(workspaceDir?: string) {
    if (workspaceDir) {
        projectCache.delete(workspaceDir);
    } else {
        projectCache.clear();
    }
}
