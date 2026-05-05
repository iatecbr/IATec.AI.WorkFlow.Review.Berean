export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'suggestion';
  category: 'security' | 'bug' | 'performance' | 'error-handling' | 'maintainability' | 'data-integrity' | 'concurrency' | 'resource-leak';
  confidence: number;
  file?: string;
  line?: number;
  title: string;
  message: string;
  suggestion?: string;
}
