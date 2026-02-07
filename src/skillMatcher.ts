import { ProjectSkill } from './projectScanner';

export class SkillMatcher {
    match(message: string, skills: ProjectSkill[]): ProjectSkill | null {
        const lowerMessage = message.toLowerCase();
        
        // Sort by priority (higher first), then filter auto-trigger only
        const sorted = [...skills]
            .filter(s => s.autoTrigger)
            .sort((a, b) => b.priority - a.priority);
        
        for (const skill of sorted) {
            for (const trigger of skill.triggers) {
                if (lowerMessage.includes(trigger.toLowerCase())) {
                    return skill;
                }
            }
        }
        
        return null;
    }
    
    // Find by exact name (for /skill command)
    findByName(name: string, skills: ProjectSkill[]): ProjectSkill | null {
        return skills.find(s => 
            s.name.toLowerCase() === name.toLowerCase()
        ) || null;
    }
}

// Singleton
let matcher: SkillMatcher | null = null;

export function getSkillMatcher(): SkillMatcher {
    if (!matcher) {
        matcher = new SkillMatcher();
    }
    return matcher;
}
