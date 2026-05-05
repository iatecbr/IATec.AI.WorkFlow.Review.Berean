import { getDefaultModel, getDefaultLanguage, getRulesPath, getMaxRulesChars, getFallbackModel, getServerHost, getServerPort } from '../../services/credentials.js';
import type { AppConfig, ConfigPort } from '../../application/ports/config.port.js';

class EnvConfigRepository implements ConfigPort {
  get<K extends keyof AppConfig>(key: K): AppConfig[K] | undefined {
    switch (key) {
      case 'defaultModel':
        return getDefaultModel() as AppConfig[K];
      case 'defaultLanguage':
        return getDefaultLanguage() as AppConfig[K];
      case 'rulesPath':
        return (getRulesPath() ?? undefined) as AppConfig[K];
      case 'maxRulesChars':
        return getMaxRulesChars() as AppConfig[K];
      case 'fallbackModel':
        return getFallbackModel() as AppConfig[K];
      case 'serverHost':
        return getServerHost() as AppConfig[K];
      case 'serverPort':
        return getServerPort() as AppConfig[K];
      default:
        return undefined;
    }
  }
}

const envConfig = new EnvConfigRepository();

export function getEnvConfig(): ConfigPort {
  return envConfig;
}
