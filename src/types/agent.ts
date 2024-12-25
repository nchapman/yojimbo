import { JSONSchema } from "./schema";
import { DefaultToolInput, OmitBaseToolInput } from "./tools";
import { Tool } from "../tools/tool";
import { LLMCompletion } from "./openai";

export interface AgentConfig<TArgs = DefaultToolInput> {
  role: string;
  goal: string;
  approach?: string | null;
  backstory?: string | null;
  parameters?: JSONSchema<OmitBaseToolInput<TArgs>>;
  llm?: LLMCompletion;
  tools?: Tool[] | null;
  maxIter?: number | null;
  verbose?: boolean | null;
  skipPropagation?: boolean;
  allowParallelToolCalls?: boolean;
}
