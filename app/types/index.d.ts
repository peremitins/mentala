export type AiWorkMode = 'therapy' | 'habits' | 'growth';

export interface UserPrompt {
  id: number;
  userId: number;
  type: AiWorkMode;
  title: string;
  content: string;
  lang: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IPromptsStore {
  items: UserPrompt[];
  loading: boolean;
}
