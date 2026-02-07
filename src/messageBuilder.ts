import { ProjectConfig, ProjectSkill } from './projectScanner';

export interface BuildResult {
    message: string;
    triggeredSkill: ProjectSkill | null;
    workflowIncluded: boolean;
}

export class MessageBuilder {
    // Track which sessions have received workflow
    private workflowSent = new Set<string>();

    build(
        userMessage: string,
        config: ProjectConfig | null,
        matchedSkill: ProjectSkill | null,
        sessionId: string
    ): BuildResult {
        const parts: string[] = [];
        let workflowIncluded = false;

        if (config) {
            // 1. Global workflows (first message only per session)
            if (config.workflows && config.workflows.length > 0 && !this.workflowSent.has(sessionId)) {
                const workflowContent = config.workflows.map(w =>
                    `[${w.name}]\n${w.content}`
                ).join('\n\n---\n\n');
                parts.push(`[Project Workflows]\n${workflowContent}`);
                this.workflowSent.add(sessionId);
                workflowIncluded = true;
            }

            // 2. Matched skill
            if (matchedSkill) {
                parts.push(`[Skill: ${matchedSkill.name}]\n${matchedSkill.content}`);
            }
        }

        // 3. User message
        parts.push(userMessage);

        return {
            message: parts.join('\n\n'),
            triggeredSkill: matchedSkill,
            workflowIncluded,
        };
    }
    
    resetSession(sessionId: string) {
        this.workflowSent.delete(sessionId);
    }
    
    resetAll() {
        this.workflowSent.clear();
    }
}

let instance: MessageBuilder | null = null;

export function getMessageBuilder(): MessageBuilder {
    if (!instance) {
        instance = new MessageBuilder();
    }
    return instance;
}
