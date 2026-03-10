/**
 * Gateway 连接配置常量
 * 
 * 这些常量在 VSCode 扩展和测试代码中共用，确保一致性
 */

export const GATEWAY_CONNECTION_CONFIG = {
    /**
     * Gateway 客户端 ID
     * 使用 'gateway-client' 可以通过 token 认证跳过 device identity
     */
    CLIENT_ID: 'gateway-client',
    
    /**
     * 协议版本
     */
    MIN_PROTOCOL: 3,
    MAX_PROTOCOL: 3,
    
    /**
     * 客户端模式
     */
    CLIENT_MODE: 'ui',
    
    /**
     * 角色
     */
    ROLE: 'operator',
    
    /**
     * 权限范围
     */
    SCOPES: ['operator.admin', 'operator.read', 'operator.write'] as const,
    
    /**
     * 默认语言
     */
    DEFAULT_LOCALE: 'zh-CN',
    
    /**
     * User Agent 前缀
     */
    USER_AGENT_PREFIX: 'openclaw-vscode'
} as const;

/**
 * 创建 Gateway 连接参数
 */
export function createConnectParams(options: {
    version: string;
    platform: string;
    locale?: string;
    token?: string;
}) {
    const params: any = {
        minProtocol: GATEWAY_CONNECTION_CONFIG.MIN_PROTOCOL,
        maxProtocol: GATEWAY_CONNECTION_CONFIG.MAX_PROTOCOL,
        client: {
            id: GATEWAY_CONNECTION_CONFIG.CLIENT_ID,
            version: options.version,
            platform: options.platform,
            mode: GATEWAY_CONNECTION_CONFIG.CLIENT_MODE
        },
        role: GATEWAY_CONNECTION_CONFIG.ROLE,
        scopes: [...GATEWAY_CONNECTION_CONFIG.SCOPES],
        locale: options.locale || GATEWAY_CONNECTION_CONFIG.DEFAULT_LOCALE,
        userAgent: `${GATEWAY_CONNECTION_CONFIG.USER_AGENT_PREFIX}/${options.version}`
    };
    
    // 如果提供了 token，添加认证
    if (options.token) {
        params.auth = { token: options.token };
    }
    
    return params;
}
