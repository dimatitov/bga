export declare const BLANKED_OPENAI_VARS: readonly string[];
export declare function buildE2eEnv(
  parentEnv: Record<string, string | undefined>,
  options: { databaseUrl: string; port: string },
): Record<string, string>;
