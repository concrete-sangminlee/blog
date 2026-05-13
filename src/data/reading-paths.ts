export interface ReadingPathDefinition {
  id: string;
  title: string;
  description: string;
  featured?: boolean;
  slugs: readonly string[];
}

export const READING_PATHS: readonly ReadingPathDefinition[] = [];
