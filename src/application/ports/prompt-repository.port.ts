export interface PromptRepository {
  getPrompt(templatePath: string): Promise<string>;
}