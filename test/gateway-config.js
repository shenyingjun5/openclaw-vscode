/**
 * 测试脚本共用的 Gateway 连接配置
 * 
 * 与 src/gateway/constants.ts 保持一致
 */

const GATEWAY_CONNECTION_CONFIG = {
    CLIENT_ID: 'gateway-client',
    MIN_PROTOCOL: 3,
    MAX_PROTOCOL: 3,
    CLIENT_MODE: 'ui',
    ROLE: 'operator',
    SCOPES: ['operator.admin', 'operator.read', 'operator.write'],
    DEFAULT_LOCALE: 'zh-CN',
    USER_AGENT_PREFIX: 'openclaw-vscode'
};

/**
 * 创建 Gateway 连接参数
 */
function createConnectParams(options) {
    const params = {
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

module.exports = {
    GATEWAY_CONNECTION_CONFIG,
    createConnectParams
};
